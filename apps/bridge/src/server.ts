import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { WebSocketServer, type WebSocket } from "ws";
import {
  emptySnapshot,
  type ClientMessage,
  type ServerMessage,
  type SessionSnapshot,
} from "@cursormobileaccess/protocol";
import type { BridgeConfig } from "./config.js";
import { ComposerMonitor } from "./extract/monitor.js";
import { publishNtfy } from "./notify/ntfy.js";

type Client = {
  ws: WebSocket;
  authed: boolean;
};

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".map": "application/json",
};

function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function snapshotEqual(a: SessionSnapshot, b: SessionSnapshot): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function serveStatic(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  webRoot: string,
): void {
  const urlPath = decodeURIComponent((req.url ?? "/").split("?")[0] || "/");
  const safe = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, "");
  let filePath = path.join(webRoot, safe === path.sep ? "index.html" : safe);

  if (!filePath.startsWith(webRoot)) {
    res.writeHead(403).end("Forbidden");
    return;
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, "index.html");
  }

  if (!fs.existsSync(filePath)) {
    // SPA fallback
    filePath = path.join(webRoot, "index.html");
  }

  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(
      "Web UI not built. Run: npm run build -w @cursormobileaccess/web",
    );
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const headers: Record<string, string> = {
    "Content-Type": MIME[ext] ?? "application/octet-stream",
  };
  // Avoid phones sticking to a stale index.html that points at old hashed assets
  if (ext === ".html" || safe === path.sep || safe === "/" || safe === "\\") {
    headers["Cache-Control"] = "no-store, no-cache, must-revalidate";
    headers.Pragma = "no-cache";
  } else {
    headers["Cache-Control"] = "public, max-age=60";
  }
  res.writeHead(200, headers);
  fs.createReadStream(filePath).pipe(res);
}

export function startBridgeServer(config: BridgeConfig): http.Server {
  const clients = new Set<Client>();
  const monitor = new ComposerMonitor(config.cdpHttpUrl);
  let state: SessionSnapshot = emptySnapshot();
  let preferredWindowId: string | null = null;

  const httpServer = http.createServer((req, res) => {
    if (req.url?.startsWith("/api/health")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          ok: true,
          cdp: state.connection.cdp,
          phase: state.phase,
        }),
      );
      return;
    }
    serveStatic(req, res, config.webRoot);
  });

  const wss = new WebSocketServer({ server: httpServer });

  const broadcast = (msg: ServerMessage) => {
    for (const c of clients) {
      if (c.authed) send(c.ws, msg);
    }
  };

  const publish = async () => {
    const { snapshot, attention } = await monitor.poll(preferredWindowId);
    preferredWindowId = snapshot.activeWindowId;

    if (!snapshotEqual(state, snapshot)) {
      const patch: Partial<SessionSnapshot> = {};
      (Object.keys(snapshot) as (keyof SessionSnapshot)[]).forEach((key) => {
        if (JSON.stringify(state[key]) !== JSON.stringify(snapshot[key])) {
          (patch as SessionSnapshot)[key] = snapshot[key] as never;
        }
      });
      state = snapshot;
      if (Object.keys(patch).length) {
        broadcast({ type: "patch", patch });
      }
    }

    if (attention) {
      broadcast({
        type: "attention",
        reason: attention.reason,
        title: attention.title,
        body: attention.body,
      });
      console.log(`[bridge] attention: ${attention.reason} — ${attention.title}`);
      void publishNtfy(config.ntfyUrl, config.ntfyTopic, {
        title: attention.title,
        body: attention.body,
        priority: attention.reason === "awaiting_input" ? 5 : 3,
        tags:
          attention.reason === "awaiting_input"
            ? ["warning", "rotating_light"]
            : attention.reason === "became_idle"
              ? ["white_check_mark"]
              : ["x"],
        clickUrl: config.publicUrl,
      }).then((r) => {
        if (r.skipped) return;
        if (!r.ok) console.warn(`[bridge] ntfy: ${r.error}`);
        else console.log("[bridge] ntfy: sent");
      });
    }
  };

  wss.on("connection", (ws) => {
    const client: Client = { ws, authed: false };
    clients.add(client);

    ws.on("close", () => clients.delete(client));
    ws.on("message", async (raw) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(String(raw)) as ClientMessage;
      } catch {
        send(ws, { type: "auth_error", message: "Invalid JSON" });
        return;
      }

      if (msg.type === "auth") {
        if (msg.token !== config.authToken) {
          send(ws, { type: "auth_error", message: "Invalid token" });
          ws.close();
          return;
        }
        client.authed = true;
        send(ws, { type: "auth_ok" });
        await publish();
        send(ws, { type: "snapshot", state });
        return;
      }

      if (!client.authed) {
        send(ws, { type: "auth_error", message: "Authenticate first" });
        return;
      }

      if (msg.type === "command") {
        try {
          if (msg.op === "select_window") {
          preferredWindowId = msg.windowId;
          await publish();
          send(ws, {
            type: "command_result",
            commandId: msg.commandId,
            ok: true,
          });
          return;
        }

        if (msg.op === "send_message") {
          const result = await monitor.sendMessage(msg.text, preferredWindowId);
          send(ws, {
            type: "command_result",
            commandId: msg.commandId,
            ok: result.ok,
            error: result.error,
          });
          if (result.ok) {
            setTimeout(() => {
              void publish();
            }, 400);
          }
          return;
        }

        if (msg.op === "invoke_action") {
          const result = await monitor.invokeAction(
            msg.actionId,
            preferredWindowId,
          );
          send(ws, {
            type: "command_result",
            commandId: msg.commandId,
            ok: result.ok,
            error: result.error,
          });
          if (result.ok) {
            setTimeout(() => {
              void publish();
            }, 500);
          }
          return;
        }

        if (msg.op === "fill_freeform") {
          const result = await monitor.fillFreeform(
            msg.text,
            preferredWindowId,
          );
          send(ws, {
            type: "command_result",
            commandId: msg.commandId,
            ok: result.ok,
            error: result.error,
          });
          if (result.ok) {
            setTimeout(() => {
              void publish();
            }, 400);
          }
          return;
        }

        if (msg.op === "select_tab") {
          const result = await monitor.selectTab(
            msg.tabId,
            preferredWindowId,
          );
          send(ws, {
            type: "command_result",
            commandId: msg.commandId,
            ok: result.ok,
            error: result.error,
          });
          if (result.ok) {
            setTimeout(() => {
              void publish();
            }, 600);
          }
          return;
        }

        if (msg.op === "attach_files") {
          const result = await monitor.attachFiles(
            msg.files,
            { text: msg.text, submit: msg.submit },
            preferredWindowId,
          );
          send(ws, {
            type: "command_result",
            commandId: msg.commandId,
            ok: result.ok,
            error: result.error,
          });
          if (result.ok) {
            setTimeout(() => {
              void publish();
            }, 600);
          }
          return;
        }

        send(ws, {
          type: "command_result",
          commandId: msg.commandId,
          ok: false,
          error: `Command '${msg.op}' not implemented yet`,
        });
        } catch (err) {
          console.warn(
            `[bridge] command ${msg.op} failed: ${(err as Error).message}`,
          );
          send(ws, {
            type: "command_result",
            commandId: msg.commandId,
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    });
  });

  setInterval(() => {
    if (![...clients].some((c) => c.authed)) return;
    void publish().catch((err) => {
      console.warn(`[bridge] poll error: ${(err as Error).message}`);
    });
  }, 750);

  setInterval(() => {
    void monitor
      .refreshTargets()
      .then((windows) => {
        console.log(
          `[bridge] CDP windows: ${windows.length}`,
          windows.map((w) => w.projectName).join(", ") || "(none)",
        );
      })
      .catch((err) => {
        console.warn(`[bridge] CDP unreachable: ${(err as Error).message}`);
      });
  }, 15_000);

  httpServer.listen(config.bindPort, config.bindHost, () => {
    console.log(
      `[bridge] http://${config.bindHost}:${config.bindPort}  (UI + WS, CDP ${config.cdpHttpUrl})`,
    );
    console.log(`[bridge] web root: ${config.webRoot}`);
  });

  httpServer.on("error", (err: NodeJS.ErrnoException) => {
    console.error(
      `[bridge] listen failed on ${config.bindHost}:${config.bindPort}: ${err.message}`,
    );
    if (err.code === "EADDRNOTAVAIL") {
      console.error(
        "[bridge] Bind address unavailable (Tailscale down?). Set BRIDGE_HOST=0.0.0.0 or fix Tailscale, then restart.",
      );
    }
    process.exit(1);
  });

  const shutdown = (signal: string) => {
    console.log(`[bridge] ${signal} — closing`);
    httpServer.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3_000).unref();
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("uncaughtException", (err) => {
    console.error("[bridge] uncaughtException:", err);
  });
  process.on("unhandledRejection", (reason) => {
    console.error("[bridge] unhandledRejection:", reason);
  });

  return httpServer;
}
