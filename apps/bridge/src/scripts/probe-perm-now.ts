/**
 * One-shot: dump permission controls including off-screen buttons.
 */
import { loadConfig } from "../config.js";
import { isWorkbenchTarget, listCdpTargets } from "../cdp/discover.js";
import { CdpClient } from "../cdp/client.js";
import { EXTRACT_ACTIONS_SOURCE } from "../extract/actions-source.js";

const config = loadConfig();
const targets = (await listCdpTargets(config.cdpHttpUrl)).filter(isWorkbenchTarget);
if (!targets[0]?.webSocketDebuggerUrl) {
  console.error("no workbench CDP target");
  process.exit(1);
}
const client = new CdpClient(targets[0].webSocketDebuggerUrl);
await client.connect();

const dump = await client.evaluate(`(() => {
  function box(el) {
    const r = el.getBoundingClientRect();
    return {
      tag: el.tagName,
      role: el.getAttribute("role"),
      text: (el.innerText || "").trim().slice(0, 80),
      aria: el.getAttribute("aria-label"),
      cls: ((el.className && el.className.toString) ? el.className.toString() : "").slice(0, 160),
      w: Math.round(r.width),
      h: Math.round(r.height),
      top: Math.round(r.top),
      inViewport: r.width > 8 && r.height > 8 && r.bottom > 0 && r.top < window.innerHeight,
    };
  }
  const prefer = [...document.querySelectorAll(
    ".composer-run-button, .composer-skip-button, [class*='composer-run-button'], [class*='composer-skip-button'], .composer-tool-call-control-row button, .composer-tool-call-control-row [role='button']"
  )].map(box);
  const labeled = [...document.querySelectorAll("button, [role='button']")].filter((el) => {
    const t = ((el.innerText || "") + " " + (el.getAttribute("aria-label") || "")).trim();
    return /\\b(skip|run|always)\\b/i.test(t) && t.length < 100;
  }).map(box);
  const rows = [...document.querySelectorAll(".composer-tool-call-control-row")].map((el) => ({
    text: (el.innerText || "").trim().slice(0, 200),
    ...box(el),
  }));
  return { prefer, labeled, rows, preferCount: prefer.length, labeledCount: labeled.length };
})()`);

const actions = await client.evaluate(EXTRACT_ACTIONS_SOURCE);
console.log(JSON.stringify({ dump, extractedActions: actions }, null, 2));
client.close();
