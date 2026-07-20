/**
 * Insert dry-run text and report submit button aria (no click / no Enter).
 */
import { loadConfig } from "../config.js";
import { isWorkbenchTarget, listCdpTargets } from "../cdp/discover.js";
import { CdpClient } from "../cdp/client.js";

const MARKER = "__cma_send_probe_do_not_submit__";
const config = loadConfig();
const targets = (await listCdpTargets(config.cdpHttpUrl)).filter(isWorkbenchTarget);
const client = new CdpClient(targets[0]!.webSocketDebuggerUrl!);
await client.connect();

const result = await client.evaluate(`(() => {
  const selectors = ${JSON.stringify([
    '.composer-bar .tiptap.ProseMirror.ui-prompt-input-editor__input',
    '.composer-bar [data-editor-owns-history="true"]',
    '.composer-bar [contenteditable="true"]',
    '[data-editor-owns-history="true"]',
  ])};
  let el = null;
  for (const sel of selectors) {
    el = [...document.querySelectorAll(sel)].find((n) => {
      if (n.closest("[data-prompt-input-tiptap-readonly], .composer-human-message")) return false;
      const r = n.getBoundingClientRect();
      return r.width > 40 && r.height > 10;
    });
    if (el) break;
  }
  if (!el) return { ok: false, error: "no editor" };
  el.focus();
  document.execCommand("selectAll", false);
  document.execCommand("insertText", false, ${JSON.stringify(MARKER)});
  const before = (el.innerText || "").trim().slice(0, 80);
  // wait a tick for React
  const prompt = el.closest(".ui-prompt-input");
  const btns = [...(prompt || document).querySelectorAll(".ui-prompt-input-submit-button, [class*='ui-prompt-input-submit-button']")].map((b) => ({
    aria: b.getAttribute("aria-label"),
    title: b.getAttribute("title"),
    cls: ((b.className && b.className.toString) ? b.className.toString() : "").slice(0, 160),
    disabled: b.disabled === true || b.getAttribute("aria-disabled") === "true",
    html: b.outerHTML.slice(0, 400),
  }));
  document.execCommand("selectAll", false);
  document.execCommand("insertText", false, "");
  return { ok: true, before, btns };
})()`);

console.log(JSON.stringify(result, null, 2));
client.close();
