/**
 * Deep probe: find "Always Run" text nodes and dump ancestor structure.
 */
import fs from "node:fs";
import { loadConfig } from "../config.js";
import { isWorkbenchTarget, listCdpTargets } from "../cdp/discover.js";
import { CdpClient } from "../cdp/client.js";

const outPath = new URL("../../../../tmp-always-run.json", import.meta.url);
const config = loadConfig();
const deadline = Date.now() + 90_000;
console.log("[always-run] waiting for Always Run UI…");

while (Date.now() < deadline) {
  try {
    const targets = (await listCdpTargets(config.cdpHttpUrl)).filter(
      isWorkbenchTarget,
    );
    const wsUrl = targets[0]?.webSocketDebuggerUrl;
    if (!wsUrl) {
      await new Promise((r) => setTimeout(r, 1500));
      continue;
    }
    const client = new CdpClient(wsUrl);
    await client.connect();
    const dump = await client.evaluate(`(() => {
      function path(el) {
        const parts = [];
        let cur = el;
        for (let i = 0; cur && i < 8; i++) {
          const cls = (cur.className?.toString?.() || "").split(/\\s+/).filter(Boolean).slice(0, 4).join(".");
          parts.push(cur.tagName.toLowerCase() + (cls ? "." + cls : "") + (cur.getAttribute("role") ? "[role=" + cur.getAttribute("role") + "]" : ""));
          cur = cur.parentElement;
        }
        return parts.join(" < ");
      }
      function summarize(el) {
        if (!el || el.nodeType !== 1) return null;
        const r = el.getBoundingClientRect();
        return {
          tag: el.tagName,
          role: el.getAttribute("role"),
          aria: el.getAttribute("aria-label"),
          type: el.getAttribute("type"),
          tabIndex: el.getAttribute("tabindex"),
          cls: (el.className?.toString?.() || "").slice(0, 240),
          text: (el.innerText || "").trim().slice(0, 80),
          w: Math.round(r.width),
          h: Math.round(r.height),
          top: Math.round(r.top),
          path: path(el),
        };
      }

      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const hits = [];
      while (walker.nextNode()) {
        const t = (walker.currentNode.nodeValue || "").trim();
        if (!/always\\s*run|^run$|^skip$/i.test(t)) continue;
        const el = walker.currentNode.parentElement;
        if (!el) continue;
        let click = el;
        for (let i = 0; i < 6 && click; i++) {
          if (
            click.matches?.("button, [role='button'], a, [tabindex]") ||
            /button|run|skip/i.test(click.className?.toString?.() || "")
          ) break;
          click = click.parentElement;
        }
        hits.push({
          text: t,
          leaf: summarize(el),
          click: summarize(click),
        });
      }

      // Also any element whose full text is exactly those labels
      const exact = [...document.querySelectorAll("button, [role='button'], div, span, a")]
        .filter((el) => {
          const tx = (el.innerText || "").trim();
          return /^(skip|run|always\\s*run)$/i.test(tx);
        })
        .slice(0, 30)
        .map(summarize);

      return { hitCount: hits.length, hits: hits.slice(0, 40), exact };
    })()`);
    client.close();

    if (dump.hitCount > 0 || (dump.exact || []).length > 0) {
      fs.writeFileSync(outPath, JSON.stringify({ at: new Date().toISOString(), dump }, null, 2));
      console.log("[always-run] FOUND", JSON.stringify({
        hitCount: dump.hitCount,
        samples: (dump.hits || []).slice(0, 8).map((h) => ({
          text: h.text,
          clickTag: h.click?.tag,
          clickCls: h.click?.cls?.slice(0, 100),
          clickRole: h.click?.role,
          path: h.click?.path?.slice(0, 200),
        })),
        exact: (dump.exact || []).slice(0, 8),
      }, null, 2));
      process.exit(0);
    }
    console.log("[always-run] not yet");
  } catch (err) {
    console.log("[always-run] err", (err as Error).message);
  }
  await new Promise((r) => setTimeout(r, 1500));
}
console.log("[always-run] timeout");
process.exit(2);
