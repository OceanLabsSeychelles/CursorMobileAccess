import type { CdpClient } from "../cdp/client.js";

export type CommandResult = { ok: boolean; error?: string };

const INPUT_SELECTORS = [
  '.composer-bar .tiptap.ProseMirror.ui-prompt-input-editor__input',
  '.composer-bar [data-editor-owns-history="true"]',
  '.composer-bar [contenteditable="true"]',
  '[data-editor-owns-history="true"]',
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
    selector?: string;
    x?: number;
    y?: number;
  }>(
    `(() => {
      const selectors = ${JSON.stringify(INPUT_SELECTORS)};
      const vh = window.innerHeight || 800;
      const vw = window.innerWidth || 1200;
      for (const sel of selectors) {
        const nodes = [...document.querySelectorAll(sel)];
        for (const el of nodes) {
          el.scrollIntoView({ block: "nearest", inline: "nearest" });
        }
        const el = nodes.find((n) => {
          if (n.closest("[data-prompt-input-tiptap-readonly], .composer-human-message, .aislash-editor-input-readonly")) {
            return false;
          }
          const cls = n.className && n.className.toString ? n.className.toString() : "";
          if (/readonly/i.test(cls)) return false;
          const r = n.getBoundingClientRect();
          return (
            r.width > 40 &&
            r.height > 10 &&
            r.bottom > 0 &&
            r.top < vh &&
            r.right > 0 &&
            r.left < vw
          );
        });
        if (!el) continue;
        const r = el.getBoundingClientRect();
        return {
          found: true,
          selector: sel,
          x: r.left + r.width / 2,
          y: r.top + Math.min(Math.max(r.height / 2, 8), 20),
        };
      }
      return { found: false };
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

  // Clear + insert. Agents Window TipTap accepts execCommand('insertText')
  // more reliably than CDP Input.insertText after focus.
  const inserted = await client.evaluate<boolean>(
    `(() => {
      const el = document.querySelector(${JSON.stringify(target.selector)});
      if (!el) return false;
      if (el.closest("[data-prompt-input-tiptap-readonly], .composer-human-message")) return false;
      el.focus();
      try {
        document.execCommand("selectAll", false);
        document.execCommand("insertText", false, ${JSON.stringify(trimmed)});
      } catch (e) {
        return false;
      }
      return (el.innerText || "").indexOf(${JSON.stringify(trimmed.slice(0, Math.min(40, trimmed.length)))}) >= 0;
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
        const el = document.querySelector(${JSON.stringify(target.selector)});
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
  // Retry briefly while TipTap/React swaps voice → send after insert.
  let submit: {
    found: boolean;
    x?: number;
    y?: number;
    aria?: string | null;
    reason?: string;
  } | null = null;

  for (let attempt = 0; attempt < 12; attempt++) {
    submit = await client.evaluate<{
      found: boolean;
      x?: number;
      y?: number;
      aria?: string | null;
      reason?: string;
    }>(
      `(() => {
        function isPermissionControl(el) {
          if (!el || !el.closest) return false;
          if (el.closest(".composer-tool-call-control-row, .composer-tool-call-allowlist-button-wrapper")) {
            return true;
          }
          var cls = el.className && el.className.toString ? el.className.toString() : "";
          return /composer-(run|skip)-button/i.test(cls);
        }

        function score(aria) {
          var a = (aria || "").toLowerCase();
          if (/\\b(run|skip|always|stop|cancel|voice|mic|dictation)\\b/i.test(a)) return -1;
          if (/\\b(send|submit)\\b/i.test(a)) return 3;
          if (!a) return 1; // icon-only send after text is present
          return 0;
        }

        var roots = [];
        var editor = document.querySelector(${JSON.stringify(target.selector)});
        if (editor) {
          var prompt = editor.closest(".ui-prompt-input");
          if (prompt) roots.push(prompt);
          var bar = editor.closest(".composer-bar");
          if (bar) roots.push(bar);
        }

        var best = null;
        var bestScore = -1;
        for (var ri = 0; ri < roots.length; ri++) {
          var scope = roots[ri];
          var candidates = scope.querySelectorAll(
            "button.ui-prompt-input-submit-button, .ui-prompt-input-submit-button"
          );
          for (var i = 0; i < candidates.length; i++) {
            var btn = candidates[i];
            if (btn.tagName === "SVG" || /submit-button__/i.test(
              btn.className && btn.className.toString ? btn.className.toString() : ""
            )) continue;
            if (isPermissionControl(btn)) continue;
            if (!btn.closest(".ui-prompt-input")) continue;
            if (btn.getAttribute("aria-disabled") === "true" || btn.disabled) continue;
            var aria = btn.getAttribute("aria-label");
            var s = score(aria);
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
          reason: "Waiting for Send button (refusing Enter — would trigger Run)",
        };
      })()`,
    );

    if (submit.found && submit.x != null && submit.y != null) break;
    await sleep(50);
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
