/**
 * Dump send controls near the live prompt editor.
 */
import { loadConfig } from "../config.js";
import { isWorkbenchTarget, listCdpTargets } from "../cdp/discover.js";
import { CdpClient } from "../cdp/client.js";

const config = loadConfig();
const targets = (await listCdpTargets(config.cdpHttpUrl)).filter(isWorkbenchTarget);
const client = new CdpClient(targets[0]!.webSocketDebuggerUrl!);
await client.connect();
const dump = await client.evaluate(`(() => {
  const editors = [...document.querySelectorAll(
    '.composer-bar .tiptap.ProseMirror, .composer-bar [contenteditable="true"], [data-editor-owns-history="true"]'
  )].filter((el) => {
    if (el.closest("[data-prompt-input-tiptap-readonly], .composer-human-message")) return false;
    const r = el.getBoundingClientRect();
    return r.width > 40 && r.height > 10;
  });
  const editor = editors[editors.length - 1] || null;
  const root =
    (editor && (editor.closest(".ui-prompt-input") || editor.closest(".composer-bar") || editor.parentElement)) ||
    document.querySelector(".composer-bar-input-buttons")?.parentElement;
  const scope = root || document.body;
  const near = [...scope.querySelectorAll("button, [role='button']")].map((el) => {
    const r = el.getBoundingClientRect();
    return {
      text: (el.innerText || "").trim().slice(0, 40),
      aria: el.getAttribute("aria-label"),
      title: el.getAttribute("title"),
      cls: ((el.className && el.className.toString) ? el.className.toString() : "").slice(0, 180),
      disabled: el.disabled === true || el.getAttribute("aria-disabled") === "true",
      w: Math.round(r.width),
      h: Math.round(r.height),
      top: Math.round(r.top),
    };
  });
  const inputButtons = document.querySelector(".composer-bar-input-buttons");
  return {
    editorFound: !!editor,
    rootCls: root ? ((root.className && root.className.toString) ? root.className.toString().slice(0, 120) : root.tagName) : null,
    near,
    inputButtonsHtml: inputButtons ? inputButtons.outerHTML.slice(0, 1500) : null,
    inputButtonsChildCount: inputButtons ? inputButtons.children.length : 0,
  };
})()`);
console.log(JSON.stringify(dump, null, 2));
client.close();
