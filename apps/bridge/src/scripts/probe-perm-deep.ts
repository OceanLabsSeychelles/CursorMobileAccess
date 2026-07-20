/**
 * Deep dump of Auto-review / permission UI — any element labeled Skip/Run/Always Run.
 */
import fs from "node:fs";
import { loadConfig } from "../config.js";
import { isWorkbenchTarget, listCdpTargets } from "../cdp/discover.js";
import { CdpClient } from "../cdp/client.js";
import { EXTRACT_ACTIONS_SOURCE } from "../extract/actions-source.js";

const outPath = new URL("../../../../tmp-perm-deep.json", import.meta.url);
const config = loadConfig();
const targets = (await listCdpTargets(config.cdpHttpUrl)).filter(isWorkbenchTarget);
console.log(
  "targets",
  targets.map((t) => ({ title: t.title?.slice(0, 60), url: t.url?.slice(0, 80) })),
);

if (!targets.length) {
  console.error("no targets");
  process.exit(1);
}

const client = new CdpClient(targets[0]!.webSocketDebuggerUrl!);
await client.connect();

const dump = await client.evaluate(`(() => {
  function box(el) {
    if (!el || el.nodeType !== 1) return null;
    const r = el.getBoundingClientRect();
    const cls = (el.className && el.className.toString) ? el.className.toString() : "";
    return {
      tag: el.tagName,
      role: el.getAttribute("role"),
      tabindex: el.getAttribute("tabindex"),
      type: el.getAttribute("type"),
      aria: el.getAttribute("aria-label"),
      cls: cls.slice(0, 220),
      text: (el.innerText || "").trim().slice(0, 100),
      w: Math.round(r.width),
      h: Math.round(r.height),
      top: Math.round(r.top),
      left: Math.round(r.left),
      disabled: el.disabled === true || el.getAttribute("aria-disabled") === "true",
      path: (() => {
        const parts = [];
        let cur = el;
        for (let i = 0; cur && i < 8; i++) {
          const c = ((cur.className && cur.className.toString) ? cur.className.toString() : "")
            .split(/\\s+/).filter(Boolean).slice(0, 4).join(".");
          parts.push(
            cur.tagName.toLowerCase() +
              (c ? "." + c : "") +
              (cur.getAttribute("role") ? "[role=" + cur.getAttribute("role") + "]" : "")
          );
          cur = cur.parentElement;
        }
        return parts.join(" < ");
      })(),
    };
  }

  // Walk text nodes for exact-ish labels
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const textHits = [];
  while (walker.nextNode()) {
    const raw = (walker.currentNode.nodeValue || "").trim();
    if (!raw) continue;
    if (!/^(skip|run|always\\s*run|auto-review)$/i.test(raw) &&
        !/^always\\s+run/i.test(raw)) continue;
    if (raw.length > 60) continue;
    let el = walker.currentNode.parentElement;
    let click = el;
    for (let i = 0; i < 8 && click; i++) {
      if (
        click.matches?.("button, [role='button'], a, [tabindex]") ||
        /button|run|skip|allow|approval|review/i.test(click.className?.toString?.() || "")
      ) break;
      click = click.parentElement;
    }
    textHits.push({ raw, leaf: box(el), click: box(click) });
  }

  // Any element whose own text is short and matches
  const all = [...document.querySelectorAll("button, [role='button'], div, span, a")];
  const exact = [];
  for (const el of all) {
    const tx = (el.innerText || "").trim().replace(/\\s+/g, " ");
    if (!tx || tx.length > 40) continue;
    if (!/^(skip|run|always\\s+run(\\s+selected)?)$/i.test(tx) &&
        !/^always\\s+run\\b/i.test(tx)) continue;
    exact.push(box(el));
    if (exact.length >= 40) break;
  }

  // Auto-review / approval containers
  const containers = [...document.querySelectorAll(
    "[class*='auto-review'], [class*='AutoReview'], [class*='tool-approval'], [class*='shell-approval'], [class*='approval'], [class*='allowlist'], .composer-tool-call-control-row, [class*='composer-run'], [class*='composer-skip']"
  )].slice(0, 20).map((el) => ({
    ...box(el),
    childButtons: [...el.querySelectorAll("button, [role='button'], [tabindex]")].slice(0, 10).map(box),
  }));

  // Broader: elements containing both Skip and Run in short text
  const blocks = [...document.querySelectorAll("div")].filter((el) => {
    const t = (el.innerText || "").trim();
    return t.length < 200 && /\\bSkip\\b/i.test(t) && /\\bRun\\b/i.test(t) && /Always/i.test(t);
  }).slice(0, 8).map((el) => ({
    ...box(el),
    html: el.innerHTML.slice(0, 800),
  }));

  return {
    textHits: textHits.slice(0, 30),
    exact: exact.slice(0, 30),
    containers,
    blocks,
  };
})()`);

const extracted = await client.evaluate(EXTRACT_ACTIONS_SOURCE);
fs.writeFileSync(outPath, JSON.stringify({ at: new Date().toISOString(), dump, extracted }, null, 2));
console.log(JSON.stringify({
  textHits: dump.textHits?.length,
  exact: dump.exact?.length,
  containers: dump.containers?.length,
  blocks: dump.blocks?.length,
  sampleTextHits: dump.textHits?.slice(0, 8),
  sampleExact: dump.exact?.slice(0, 12),
  sampleBlocks: dump.blocks?.slice(0, 3).map((b) => ({ text: b.text, cls: b.cls, path: b.path, html: b.html?.slice(0, 400) })),
  actions: extracted,
}, null, 2));
client.close();
