import { loadConfig } from "../config.js";
import { isWorkbenchTarget, listCdpTargets } from "../cdp/discover.js";
import { CdpClient } from "../cdp/client.js";

const config = loadConfig();
const targets = (await listCdpTargets(config.cdpHttpUrl)).filter(isWorkbenchTarget);
const page = targets.find((t) => /agents/i.test(t.title)) ?? targets[0];
const client = new CdpClient(page!.webSocketDebuggerUrl!);
await client.connect();
await client.bringToFront();

const marker = `send-btn-${Date.now()}`;

// Focus + type so voice→send swap happens
const typed = await client.evaluate(`(() => {
  const el = document.querySelector('[data-editor-owns-history="true"], .tiptap.ProseMirror.ui-prompt-input-editor__input');
  if (!el) return { ok: false };
  el.focus();
  document.execCommand("selectAll", false);
  document.execCommand("insertText", false, ${JSON.stringify(marker)});
  return { ok: true, text: (el.innerText||"").slice(0,60) };
})()`);
console.log("typed", typed);
await new Promise((r) => setTimeout(r, 300));

const buttons = await client.evaluate(`(() => {
  const editor = document.querySelector('[data-editor-owns-history="true"]');
  const prompt = editor && editor.closest(".ui-prompt-input");
  const bar = editor && editor.closest(".composer-bar");
  function dump(scope, label) {
    if (!scope) return { label, missing: true };
    const all = [...scope.querySelectorAll("button, [role=button]")];
    return {
      label,
      count: all.length,
      buttons: all.slice(0, 30).map((b) => {
        const r = b.getBoundingClientRect();
        const cls = (b.className && b.className.toString ? b.className.toString() : "").slice(0, 120);
        return {
          tag: b.tagName,
          aria: b.getAttribute("aria-label"),
          disabled: !!(b.disabled || b.getAttribute("aria-disabled") === "true"),
          cls,
          w: Math.round(r.width),
          h: Math.round(r.height),
          inPrompt: !!b.closest(".ui-prompt-input"),
        };
      }),
    };
  }
  return {
    hasPrompt: !!prompt,
    hasBar: !!bar,
    submitNamed: [...document.querySelectorAll(".ui-prompt-input-submit-button, button.ui-prompt-input-submit-button")].map((b) => ({
      aria: b.getAttribute("aria-label"),
      disabled: !!(b.disabled || b.getAttribute("aria-disabled") === "true"),
      cls: (b.className||"").toString().slice(0,140),
      w: Math.round(b.getBoundingClientRect().width),
      h: Math.round(b.getBoundingClientRect().height),
    })),
    prompt: dump(prompt, "prompt"),
    bar: dump(bar, "bar"),
  };
})()`);
console.log(JSON.stringify(buttons, null, 2));

// clear
await client.evaluate(`(() => {
  const el = document.querySelector('[data-editor-owns-history="true"]');
  if (!el) return;
  el.focus();
  document.execCommand("selectAll", false);
  document.execCommand("delete", false);
})()`);
client.close();
