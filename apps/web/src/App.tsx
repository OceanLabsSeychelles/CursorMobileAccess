import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type {
  Action,
  ClientMessage,
  CommandPayload,
  ServerMessage,
  SessionSnapshot,
  TimelineItem,
} from "@cursormobileaccess/protocol";
import { emptySnapshot } from "@cursormobileaccess/protocol";
import "./App.css";

const TOKEN_KEY = "cma_token";

function defaultWsUrl(): string {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}`;
}

type ConnState = "idle" | "connecting" | "live" | "error";

export default function App() {
  const [token, setToken] = useState(
    () => localStorage.getItem(TOKEN_KEY) ?? "dev-change-me",
  );
  const [conn, setConn] = useState<ConnState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<SessionSnapshot>(emptySnapshot());
  const [draft, setDraft] = useState("");
  const [pendingFile, setPendingFile] = useState<{
    name: string;
    mime: string;
    dataBase64: string;
  } | null>(null);
  const [attaching, setAttaching] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [attention, setAttention] = useState<string | null>(null);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(
    null,
  );
  const [freeformOpen, setFreeformOpen] = useState(false);
  const [freeformText, setFreeformText] = useState("");
  const [chromeCompact, setChromeCompact] = useState(() => {
    try {
      return localStorage.getItem("cma_chrome_compact") === "1";
    } catch {
      return false;
    }
  });

  // Keep freeform open from the phone tap — Cursor expands Other into an input
  // and action ids/labels churn, which previously closed the box immediately.
  const showFreeform =
    freeformOpen && state.actions.some((a) => a.kind === "answer");

  const setCompact = useCallback((next: boolean) => {
    setChromeCompact(next);
    try {
      localStorage.setItem("cma_chrome_compact", next ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, []);
  const disconnect = useCallback(() => {
    socket?.close();
    setSocket(null);
    setConn("idle");
  }, [socket]);

  const connect = useCallback(() => {
    disconnect();
    setError(null);
    setAttention(null);
    setConn("connecting");
    localStorage.setItem(TOKEN_KEY, token);

    const ws = new WebSocket(defaultWsUrl());

    ws.onopen = () => {
      const auth: ClientMessage = { type: "auth", token };
      ws.send(JSON.stringify(auth));
    };

    ws.onmessage = (ev) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(String(ev.data)) as ServerMessage;
      } catch {
        setError("Bad server frame");
        return;
      }

      if (msg.type === "auth_ok") {
        setConn("live");
        return;
      }
      if (msg.type === "auth_error") {
        setConn("error");
        setError(msg.message);
        ws.close();
        return;
      }
      if (msg.type === "snapshot") {
        setState(msg.state);
        // Do not adopt CDP selected flags — they false-positive and snap Other→A.
        if (!msg.state.actions.some((a) => a.kind === "answer")) {
          setSelectedOptionId(null);
          setFreeformOpen(false);
          setFreeformText("");
        }
        return;
      }
      if (msg.type === "patch") {
        setState((prev) => {
          const next = { ...prev, ...msg.patch };
          const actions = next.actions ?? prev.actions;
          if (!actions.some((a) => a.kind === "answer")) {
            setSelectedOptionId(null);
            setFreeformOpen(false);
            setFreeformText("");
          }
          return next;
        });
        return;
      }
      if (msg.type === "command_result" && !msg.ok) {
        setError(msg.error ?? "Command failed");
      }
      if (msg.type === "attention") {
        setAttention(`${msg.title}: ${msg.body}`);
        if ("Notification" in window && Notification.permission === "granted") {
          new Notification(msg.title, { body: msg.body });
        }
      }
    };

    ws.onerror = () => {
      setConn("error");
      setError("WebSocket error — is the bridge running?");
    };

    ws.onclose = () => {
      setConn((c) => (c === "live" ? "idle" : c));
      setSocket(null);
    };

    setSocket(ws);
  }, [token, disconnect]);

  useEffect(() => () => socket?.close(), [socket]);

  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      void Notification.requestPermission();
    }
  }, []);

  const sendCommand = useCallback(
    (payload: CommandPayload) => {
      if (!socket || conn !== "live") return;
      const commandId = `c-${Date.now()}`;
      const frame: ClientMessage = { type: "command", commandId, ...payload };
      socket.send(JSON.stringify(frame));
    },
    [socket, conn],
  );

  const sendComposer = useCallback(() => {
    const text = draft.trim();
    if (pendingFile) {
      setAttaching(true);
      setError(null);
      sendCommand({
        op: "attach_files",
        files: [
          {
            name: pendingFile.name,
            mime: pendingFile.mime,
            dataBase64: pendingFile.dataBase64,
          },
        ],
        text: text || undefined,
        submit: true,
      });
      setDraft("");
      setPendingFile(null);
      window.setTimeout(() => setAttaching(false), 2500);
      return;
    }
    if (!text) return;
    sendCommand({ op: "send_message", text });
    setDraft("");
  }, [draft, pendingFile, sendCommand]);

  const phaseLabel = useMemo(() => {
    const map: Record<string, string> = {
      disconnected: "Offline",
      idle: "Ready",
      thinking: "Thinking",
      tool: "Working",
      awaiting_input: "Needs you",
      error: "Error",
    };
    return map[state.phase] ?? state.phase;
  }, [state.phase]);

  const project =
    state.windows.find((w) => w.id === state.activeWindowId)?.projectName ??
    "No window";

  return (
    <div className={`app ${conn === "live" ? "app-live" : ""}`}>
      <div
        className={
          conn === "live"
            ? `session-chrome${chromeCompact ? " compact" : ""}`
            : undefined
        }
      >
        <header className="hero">
          <div className={`hero-top${chromeCompact ? " compact-top" : ""}`}>
            <div className={`hero-brand${chromeCompact ? " collapsed" : ""}`}>
              <p className="brand">CursorMobileAccess</p>
              <p className="tagline">Your agents. Your network. Your UI.</p>
            </div>
            {!chromeCompact && conn === "live" ? (
              <button
                type="button"
                className="chrome-toggle"
                aria-label="Collapse header"
                aria-expanded
                onClick={() => setCompact(true)}
              >
                ▴
              </button>
            ) : null}
          </div>
          <div className="phase-row">
            <div className="phase">
              <span
                className={`dot ${state.phase === "awaiting_input" ? "warn" : state.connection.cdp ? "ok" : "bad"}`}
              />
              <span className="phase-text">{phaseLabel}</span>
              {state.activityText ? (
                <span className="activity">{state.activityText}</span>
              ) : null}
            </div>
            {conn === "live" && chromeCompact ? (
              <button
                type="button"
                className="chrome-toggle"
                aria-label="Expand header"
                aria-expanded={false}
                onClick={() => setCompact(false)}
              >
                ▾
              </button>
            ) : null}
          </div>
        </header>

        {conn === "live" ? (
          <div className={`chrome-detail${chromeCompact ? " collapsed" : ""}`}>
            <div className="meta">
              <strong>{project}</strong>
              <button type="button" className="link" onClick={disconnect}>
                Disconnect
              </button>
            </div>

            {state.tabs.length > 0 ? (
              <div className="tabs" aria-label="Agent chats">
                {state.tabs.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={t.active ? "tab active" : "tab"}
                    onClick={() => {
                      setSelectedOptionId(null);
                      setFreeformOpen(false);
                      setFreeformText("");
                      sendCommand({ op: "select_tab", tabId: t.id });
                    }}
                  >
                    {t.title}
                  </button>
                ))}
              </div>
            ) : (
              <p className="hint tabs-hint">
                No chat list yet — open the Agents sidebar in Cursor.
              </p>
            )}

            {attention ? <div className="banner">{attention}</div> : null}
            {error ? <div className="banner error-banner">{error}</div> : null}
          </div>
        ) : null}
      </div>

      {conn !== "live" ? (
        <section className="connect">
          <h1>Connect</h1>
          <p className="hint">
            Same-origin to this bridge — no Expo, any browser on Tailscale.
          </p>
          <label>
            Auth token
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              autoComplete="current-password"
            />
          </label>
          <button
            className="primary"
            type="button"
            onClick={connect}
            disabled={conn === "connecting"}
          >
            {conn === "connecting" ? "Connecting…" : "Enter"}
          </button>
          {error ? <p className="error">{error}</p> : null}
        </section>
      ) : (
        <>
          <main className="timeline">
            {state.timeline.length === 0 ? (
              <p className="empty">No messages yet for this chat.</p>
            ) : (
              state.timeline.map((item) => (
                <TimelineRow key={item.id} item={item} />
              ))
            )}
          </main>

          <div className="actions-dock">
            {state.actions.length > 0 ? (
              <>
                <p className="actions-label">Needs your action</p>
                {state.pendingPrompt ? (
                  <p className="pending-prompt">{state.pendingPrompt}</p>
                ) : null}
                <div className="actions">
                  {state.actions.map((a) => {
                    const isSelected =
                      a.kind === "answer" &&
                      selectedOptionId != null &&
                      (a.optionId === selectedOptionId ||
                        a.id === selectedOptionId);
                    return (
                      <ActionChip
                        key={a.id}
                        action={a}
                        selected={isSelected}
                        onPress={() => {
                          if (a.kind === "answer") {
                            setSelectedOptionId(a.optionId ?? a.id);
                            if (a.freeform === true) {
                              setFreeformOpen(true);
                            } else {
                              setFreeformOpen(false);
                              setFreeformText("");
                            }
                            sendCommand({
                              op: "invoke_action",
                              actionId: a.id,
                            });
                            return;
                          }
                          if (
                            (a.kind === "allow" || /continue/i.test(a.label)) &&
                            showFreeform &&
                            freeformText.trim()
                          ) {
                            sendCommand({
                              op: "fill_freeform",
                              text: freeformText.trim(),
                            });
                            window.setTimeout(() => {
                              sendCommand({
                                op: "invoke_action",
                                actionId: a.id,
                              });
                            }, 350);
                            return;
                          }
                          sendCommand({
                            op: "invoke_action",
                            actionId: a.id,
                          });
                        }}
                      />
                    );
                  })}
                </div>
                {showFreeform ? (
                  <div className="freeform-box">
                    <label className="freeform-label" htmlFor="freeform-input">
                      Other — type your answer
                    </label>
                    <textarea
                      id="freeform-input"
                      className="freeform-input"
                      value={freeformText}
                      onChange={(e) => setFreeformText(e.target.value)}
                      placeholder="Type here, then tap Continue…"
                      rows={3}
                      autoFocus
                    />
                    <button
                      type="button"
                      className="primary chip freeform-apply"
                      onClick={() => {
                        const text = freeformText.trim();
                        if (!text) {
                          setError("Type an answer before Continue");
                          return;
                        }
                        sendCommand({ op: "fill_freeform", text });
                      }}
                    >
                      Apply text to Cursor
                    </button>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="actions-hint">
                No pending Run / Skip / Approve / answer buttons in Cursor right
                now. When the agent waits for one, it will show up here.
              </p>
            )}
          </div>

          <footer className="composer">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.pdf,.txt,.md,.csv,.json"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                if (file.size > 8 * 1024 * 1024) {
                  setError("Image too large (max 8 MiB)");
                  return;
                }
                const reader = new FileReader();
                reader.onload = () => {
                  const result = String(reader.result || "");
                  const comma = result.indexOf(",");
                  const dataBase64 =
                    comma >= 0 ? result.slice(comma + 1) : result;
                  setPendingFile({
                    name: file.name,
                    mime: file.type || "application/octet-stream",
                    dataBase64,
                  });
                  setError(null);
                };
                reader.onerror = () => setError("Could not read file");
                reader.readAsDataURL(file);
              }}
            />
            <button
              type="button"
              className="icon-btn"
              title="Attach image"
              disabled={attaching}
              onClick={() => fileInputRef.current?.click()}
            >
              📎
            </button>
            <div className="composer-main">
              {pendingFile ? (
                <div className="pending-file">
                  <span>{pendingFile.name}</span>
                  <button
                    type="button"
                    className="link"
                    onClick={() => setPendingFile(null)}
                  >
                    Remove
                  </button>
                </div>
              ) : null}
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={
                  pendingFile
                    ? "Caption (optional)…"
                    : "Message the active chat…"
                }
                rows={2}
                disabled={attaching}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void sendComposer();
                  }
                }}
              />
            </div>
            <button
              type="button"
              className="primary send"
              disabled={attaching || (!draft.trim() && !pendingFile)}
              onClick={() => void sendComposer()}
            >
              {attaching ? "…" : "Send"}
            </button>
          </footer>
        </>
      )}
    </div>
  );
}

const MESSAGE_PREVIEW_LINES = 6;
const MESSAGE_PREVIEW_CHARS = 320;

function CollapsibleMessageBubble({
  text,
  variant,
}: {
  text: string;
  variant: "user" | "assistant";
}) {
  const [expanded, setExpanded] = useState(false);
  const collapsible =
    text.length > MESSAGE_PREVIEW_CHARS ||
    text.split("\n").length > MESSAGE_PREVIEW_LINES;

  return (
    <div className={`bubble ${variant}`}>
      <p
        className={
          collapsible && !expanded ? "bubble-text bubble-text-clamped" : "bubble-text"
        }
      >
        {text}
      </p>
      {collapsible ? (
        <button
          type="button"
          className="show-message-btn"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "Show less" : "Show message"}
        </button>
      ) : null}
    </div>
  );
}

function TimelineRow({ item }: { item: TimelineItem }) {
  switch (item.kind) {
    case "user":
      return <CollapsibleMessageBubble text={item.text} variant="user" />;
    case "assistant":
      return <CollapsibleMessageBubble text={item.markdown} variant="assistant" />;
    case "thought":
      return (
        <p className="thought">
          {item.summary ?? "Thought"}
          {item.durationSec != null ? ` · ${item.durationSec}s` : ""}
        </p>
      );
    case "tool":
      return (
        <div className="card">
          <strong>{item.title}</strong>
          {item.detail ? <p>{item.detail}</p> : null}
          <span className="meta-chip">{item.status}</span>
        </div>
      );
    case "command":
      return (
        <div className="card">
          <strong>{item.description ?? "Command"}</strong>
          <pre>{item.command}</pre>
        </div>
      );
    case "plan":
      return (
        <div className="card">
          <strong>{item.title}</strong>
          {item.summary ? <p>{item.summary}</p> : null}
          <ul>
            {item.todos.map((t) => (
              <li key={t.id}>
                {t.status === "completed"
                  ? "✓"
                  : t.status === "in_progress"
                    ? "…"
                    : "○"}{" "}
                {t.text}
              </li>
            ))}
          </ul>
        </div>
      );
    case "question":
      return (
        <div className="card">
          <strong>{item.prompt}</strong>
          <ul>
            {item.options.map((o) => (
              <li key={o.id}>{o.label}</li>
            ))}
          </ul>
        </div>
      );
    default:
      return null;
  }
}

function ActionChip({
  action,
  selected,
  onPress,
}: {
  action: Action;
  selected?: boolean;
  onPress: () => void;
}) {
  const isAnswer = action.kind === "answer";
  const primary = ["approve", "run", "allow", "build"].includes(action.kind);
  // Answer chips stay muted until selected so the color change is obvious.
  const classes = [
    "chip",
    primary ? "primary-chip" : "",
    isAnswer ? "answer-chip" : "",
    selected ? "is-selected" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const selectedStyle: CSSProperties | undefined = selected
    ? {
        background: "#5cdb95",
        color: "#0e1116",
        border: "2px solid #f4f1ea",
        boxShadow: "0 0 0 3px rgba(92, 219, 149, 0.55)",
        fontWeight: 800,
      }
    : isAnswer
      ? {
          background: "#2a3344",
          color: "#f4f1ea",
          border: "1px solid #4b5568",
        }
      : undefined;

  return (
    <button
      type="button"
      className={classes}
      style={selectedStyle}
      aria-pressed={selected ? true : false}
      onClick={onPress}
    >
      {selected && isAnswer ? "✓ " : ""}
      {action.label}
    </button>
  );
}
