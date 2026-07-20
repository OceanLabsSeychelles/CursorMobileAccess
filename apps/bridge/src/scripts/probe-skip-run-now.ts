/**
 * Find any node containing Auto-review + Skip + Run and dump full structure.
 */
import fs from "node:fs";
import { loadConfig } from "../config.js";
import { isWorkbenchTarget, listCdpTargets } from "../cdp/discover.js";
import { CdpClient } from "../cdp/client.js";
import { EXTRACT_ACTIONS_SOURCE } from "../extract/actions-source.js";

const out = new URL("../../../../tmp-skip-run-now.json", import.meta.url);
const config = loadConfig();
const targets = (await listCdpTargets(config.cdpHttpUrl)).filter(isWorkbenchTarget);
const client = new CdpClient(targets[0]!.webSocketDebuggerUrl!);
await client.connect();

const dump = await client.evaluate(`(() => {
  function summarize(el, depth) {
    if (!el || el.nodeType !== 1) return null;
    const r = el.getBoundingClientRect();
    const kids = depth > 0 ? [...el.children].slice(0, 20).map((c) => summarize(c, depth - 1)) : undefined;
    return {
      tag: el.tagName,
      role: el.getAttribute("role"),
      tabindex: el.getAttribute("tabindex"),
      aria: el.getAttribute("aria-label"),
      cls: ((el.className && el.className.toString) ? el.className.toString() : "").slice(0, 240),
      text: (el.innerText || "").trim().slice(0, 120),
      w: Math.round(r.width),
      h: Math.round(r.height),
      top: Math.round(r.top),
      kids,
    };
  }

  // Shadow roots
  const shadows = [];
  const allEls = [...document.querySelectorAll("*")];
  for (const el of allEls) {
    if (el.shadowRoot) {
      const t = (el.shadowRoot.textContent || "").slice(0, 200);
      if (/skip|always\\s*run|auto-review/i.test(t)) {
        shadows.push({
          host: el.tagName,
          hostCls: ((el.className && el.className.toString) ? el.className.toString() : "").slice(0, 120),
          text: t,
        });
      }
    }
  }

  // Smallest elements whose text contains Skip AND Run AND Always
  const candidates = allEls.filter((el) => {
    const t = (el.innerText || "").trim();
    if (t.length < 8 || t.length > 400) return false;
    return /\\bSkip\\b/i.test(t) && /\\bRun\\b/i.test(t) && /Always/i.test(t);
  });
  // Prefer smaller text blocks
  candidates.sort((a, b) => (a.innerText || "").length - (b.innerText || "").length);

  const blocks = candidates.slice(0, 6).map((el) => ({
    ...summarize(el, 3),
    html: el.outerHTML.slice(0, 2500),
  }));

  // Exact label leaves
  const leaves = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const raw = (walker.currentNode.nodeValue || "").replace(/\\s+/g, " ").trim();
    if (!raw || raw.length > 40) continue;
    if (!/^(Skip|Run|Always Run|Auto-review|Always Run Selected)$/i.test(raw) &&
        !/^Always Run\\b/i.test(raw)) continue;
    const el = walker.currentNode.parentElement;
    let click = el;
    for (let i = 0; i < 10 && click; i++) {
      if (click.matches?.("button,[role=button],a,[tabindex]") ||
          /button|approval|gate|run|skip/i.test(click.className?.toString?.() || "")) break;
      click = click.parentElement;
    }
    leaves.push({
      raw,
      leaf: summarize(el, 0),
      click: summarize(click, 1),
    });
    if (leaves.length >= 30) break;
  }

  // Also search iframes
  const frames = [...document.querySelectorAll("iframe")].map((f) => ({
    src: f.src?.slice(0, 120),
    id: f.id,
    cls: ((f.className && f.className.toString) ? f.className.toString() : "").slice(0, 80),
  }));

  return {
    blockCount: candidates.length,
    blocks,
    leaves,
    shadows,
    frames,
    bodyHasAutoReview: /Auto-review/i.test(document.body.innerText || ""),
    bodyHasHello: /hello-world/i.test(document.body.innerText || ""),
  };
})()`);

const extracted = await client.evaluate(EXTRACT_ACTIONS_SOURCE);
fs.writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), dump, extracted }, null, 2));
console.log(JSON.stringify({
  blockCount: dump.blockCount,
  bodyHasAutoReview: dump.bodyHasAutoReview,
  bodyHasHello: dump.bodyHasHello,
  shadows: dump.shadows,
  frames: dump.frames,
  leaves: dump.leaves,
  blocks: (dump.blocks || []).map((b) => ({
    tag: b.tag,
    cls: b.cls,
    text: b.text,
    top: b.top,
    kids: b.kids?.map((k) => ({ tag: k.tag, cls: k.cls?.slice(0, 80), text: k.text, role: k.role, kids: k.kids?.map((kk) => ({ tag: kk.tag, text: kk.text, cls: kk.cls?.slice(0, 60), role: kk.role })) })),
    html: b.html?.slice(0, 800),
  })),
  extracted,
}, null, 2));
client.close();
