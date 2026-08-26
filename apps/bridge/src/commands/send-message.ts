import type { CdpClient } from "../cdp/client.js";

export type CommandResult = { ok: boolean; error?: string };

/**
 * Prefer .ui-prompt-input (current Agents Window). .composer-bar is legacy —
 * Cursor no longer wraps the live TipTap editor in it.
 */
const INPUT_SELECTORS = [
  '.ui-prompt-input .tiptap.ProseMirror.ui-prompt-input-editor__input',
  '.ui-prompt-input [data-editor-owns-history="true"]',
  '.ui-prompt-input [contenteditable="true"]',
  '.composer-bar .tiptap.ProseMirror.ui-prompt-input-editor__input',
  '.composer-bar [data-editor-owns-history="true"]',
  '.composer-bar [contenteditable="true"]',
  '[data-editor-owns-history="true"]',
  ".tiptap.ProseMirror.ui-prompt-input-editor__input",
  ".aislash-editor-input",
];

/**
 * Type into the active Composer via CDP.
 *
 * CRITICAL: never submit with Enter. Cursor binds Enter to "Run" while a
 * shell/tool permission prompt is open — phone sends must not approve it.
 * Always click the prompt-input submit button instead.
 */
export async function sendComposerMessage(
  client: CdpClient,
  text: string,
): Promise<CommandResult> {
  const trimmed = text.trim();
  if (!trimmed) {
    return { ok: false, error: "Empty message" };
  }

  await client.bringToFront();
  await sleep(100);

  const target = await client.evaluate<{
    found: boolean;
    x?: number;
    y?: number;
    reason?: string;
  }>(
    `(() => {
      ${FIND_LIVE_EDITOR_JS}
      const el = findLiveEditor(${JSON.stringify(INPUT_SELECTORS)});
      if (!el) return { found: false, reason: "no visible TipTap editor" };
      const r = el.getBoundingClientRect();
      return {
        found: true,
        x: r.left + r.width / 2,
        y: r.top + Math.min(Math.max(r.height / 2, 8), 20),
      };
    })()`,
  );

  if (!target.found || target.x == null || target.y == null) {
    return {
      ok: false,
      error: "Composer input not found — is the agent chat panel open?",
    };
  }

  await clickAt(client, target.x, target.y);
  await sleep(80);

  // Clear + insert. Prefer TipTap commands / execCommand; fall back to CDP.
  // Always re-resolve the live editor — querySelector(first) can hit history.
  const inserted = await client.evaluate<boolean>(
    `(() => {
      ${FIND_LIVE_EDITOR_JS}
      const el = findLiveEditor(${JSON.stringify(INPUT_SELECTORS)});
      if (!el) return false;
      el.focus();
      const needle = ${JSON.stringify(trimmed.slice(0, Math.min(40, trimmed.length)))};
      const full = ${JSON.stringify(trimmed)};

      // TipTap Editor instance (most reliable when present)
      let node = el;
      for (let i = 0; i < 8 && node; i++) {
        const tip = node.editor;
        if (tip && tip.commands) {
          try {
            if (tip.commands.clearContent) tip.commands.clearContent(true);
            if (tip.commands.insertContent) {
              tip.commands.insertContent(full);
            } else if (tip.commands.setContent) {
              tip.commands.setContent(full);
            }
            return (el.innerText || "").indexOf(needle) >= 0;
          } catch (e) { /* fall through */ }
        }
        node = node.parentElement;
      }

      try {
        document.execCommand("selectAll", false);
        document.execCommand("insertText", false, full);
      } catch (e) {
        return false;
      }
      return (el.innerText || "").indexOf(needle) >= 0;
    })()`,
  );

  if (!inserted) {
    await client.keyDown("a", { ctrlKey: true });
    await client.keyUp("a", { ctrlKey: true });
    await sleep(40);
    await client.keyDown("Backspace");
    await client.keyUp("Backspace");
    await sleep(40);
    await client.insertText(trimmed);
    await sleep(80);
    const verified = await client.evaluate<boolean>(
      `(() => {
        ${FIND_LIVE_EDITOR_JS}
        const el = findLiveEditor(${JSON.stringify(INPUT_SELECTORS)});
        const t = (el && el.innerText || "").trim();
        return t.indexOf(${JSON.stringify(trimmed.slice(0, Math.min(40, trimmed.length)))}) >= 0;
      })()`,
    );
    if (!verified) {
      return {
        ok: false,
        error:
          "Could not insert text into TipTap composer (execCommand and Input.insertText failed)",
      };
    }
  }

  // Click the prompt submit button — never Enter (Run keybinding).
  // Aria labels vary: "Send message", "Queue message" (while generating).
  // Reject Stop / voice. Prefer .ui-prompt-input-submit-button by class.
  let submit: {
    found: boolean;
    x?: number;
    y?: number;
    aria?: string | null;
    reason?: string;
  } | null = null;

  for (let attempt = 0; attempt < 16; attempt++) {
    submit = await client.evaluate<{
      found: boolean;
      x?: number;
      y?: number;
      aria?: string | null;
      reason?: string;
    }>(
      `(() => {
        ${FIND_LIVE_EDITOR_JS}
        function isPermissionControl(el) {
          if (!el || !el.closest) return false;
          if (el.closest(".composer-tool-call-control-row, .composer-tool-call-allowlist-button-wrapper")) {
            return true;
          }
          var cls = el.className && el.className.toString ? el.className.toString() : "";
          return /composer-(run|skip)-button/i.test(cls);
        }

        function score(btn) {
          var aria = (btn.getAttribute("aria-label") || "").toLowerCase();
          var cls = btn.className && btn.className.toString ? btn.className.toString() : "";
          var isSubmitClass = /ui-prompt-input-submit-button/.test(cls) &&
            !/submit-button__/.test(cls);
          if (/\\b(run|skip|always|stop|cancel|voice|mic|dictation)\\b/i.test(aria)) return -1;
          if (/\\b(send|submit|queue)\\b/i.test(aria)) return 4;
          if (isSubmitClass) return 3; // class wins even if aria is empty/unknown
          if (!aria) return 1;
          return 0;
        }

        var editor = findLiveEditor(${JSON.stringify(INPUT_SELECTORS)});
        var roots = [];
        if (editor) {
          var prompt = editor.closest(".ui-prompt-input");
          if (prompt) roots.push(prompt);
          var bar = editor.closest(".composer-bar");
          if (bar) roots.push(bar);
        }
        if (!roots.length) {
          var any = document.querySelector(".ui-prompt-input");
          if (any) roots.push(any);
        }

        var best = null;
        var bestScore = -1;
        var sawStop = false;
        for (var ri = 0; ri < roots.length; ri++) {
          var scope = roots[ri];
          var candidates = scope.querySelectorAll(
            "button.ui-prompt-input-submit-button, .ui-prompt-input-submit-button, button"
          );
          for (var i = 0; i < candidates.length; i++) {
            var btn = candidates[i];
            if (btn.tagName === "SVG") continue;
            if (isPermissionControl(btn)) continue;
            if (!btn.closest(".ui-prompt-input") && !btn.closest(".composer-bar")) continue;
            if (btn.getAttribute("aria-disabled") === "true" || btn.disabled) continue;
            var aria = btn.getAttribute("aria-label");
            if (/stop/i.test(aria || "")) sawStop = true;
            var s = score(btn);
            if (s < 0) continue;
            var r = btn.getBoundingClientRect();
            if (r.width < 8 || r.height < 8) continue;
            if (s > bestScore) {
              bestScore = s;
              best = {
                found: true,
                x: r.left + r.width / 2,
                y: r.top + r.height / 2,
                aria: aria,
              };
            }
          }
        }
        if (best && bestScore >= 1) return best;
        return {
          found: false,
          reason: sawStop
            ? "Agent is generating (Stop button showing) — wait for it to finish, or message will queue when Send/Queue appears"
            : "Waiting for Send/Queue button (refusing Enter — would trigger Run)",
        };
      })()`,
    );

    if (submit.found && submit.x != null && submit.y != null) break;
    await sleep(75);
  }

  if (!submit?.found || submit.x == null || submit.y == null) {
    // Leave text in the composer rather than risk approving a permission via Enter.
    return {
      ok: false,
      error:
        submit?.reason ||
        "Could not click Send — refusing Enter because it activates Run on permission prompts",
    };
  }

  await clickAt(client, submit.x, submit.y);
  return { ok: true };
}

/** Shared DOM helper injected into evaluate() strings. */
const FIND_LIVE_EDITOR_JS = `
function findLiveEditor(selectors) {
  var vh = window.innerHeight || 800;
  var vw = window.innerWidth || 1200;
  function isBad(n) {
    if (!n) return true;
    if (n.closest("[data-prompt-input-tiptap-readonly], .composer-human-message, .aislash-editor-input-readonly")) {
      return true;
    }
    var cls = n.className && n.className.toString ? n.className.toString() : "";
    if (/readonly/i.test(cls)) return true;
    return false;
  }
  function isVisible(n) {
    var r = n.getBoundingClientRect();
    return (
      r.width > 40 &&
      r.height > 10 &&
      r.bottom > 0 &&
      r.top < vh &&
      r.right > 0 &&
      r.left < vw
    );
  }
  for (var si = 0; si < selectors.length; si++) {
    var nodes = Array.prototype.slice.call(document.querySelectorAll(selectors[si]));
    for (var ni = 0; ni < nodes.length; ni++) {
      try { nodes[ni].scrollIntoView({ block: "nearest", inline: "nearest" }); } catch (e) {}
    }
    for (var j = 0; j < nodes.length; j++) {
      var el = nodes[j];
      if (isBad(el) || !isVisible(el)) continue;
      return el;
    }
  }
  return null;
}
`;

async function clickAt(client: CdpClient, x: number, y: number): Promise<void> {
  const base = {
    x: Math.round(x),
    y: Math.round(y),
    button: "left" as const,
    clickCount: 1,
  };
  await client.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    ...base,
  });
  await client.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    ...base,
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
