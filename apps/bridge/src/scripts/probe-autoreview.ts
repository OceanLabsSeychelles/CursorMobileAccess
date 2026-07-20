/**
 * Find Auto-review / classifying-error tool blocks and dump structure.
 */
import fs from "node:fs";
import { loadConfig } from "../config.js";
import { isWorkbenchTarget, listCdpTargets } from "../cdp/discover.js";
import { CdpClient } from "../cdp/client.js";

const outPath = new URL("../../../../tmp-autoreview.json", import.meta.url);
const config = loadConfig();
const allTargets = await listCdpTargets(config.cdpHttpUrl);
console.log(
  "all targets",
  allTargets.map((t) => ({
    title: (t.title || "").slice(0, 50),
    type: t.type,
    url: (t.url || "").slice(0, 90),
  })),
);

const workbench = allTargets.filter(isWorkbenchTarget);
const clients = workbench.length ? workbench : allTargets.filter((t) => t.webSocketDebuggerUrl);

for (const target of clients.slice(0, 4)) {
  if (!target.webSocketDebuggerUrl) continue;
  const client = new CdpClient(target.webSocketDebuggerUrl);
  await client.connect();
  const dump = await client.evaluate(`(() => {
    const needle = /auto-review|classifying this action|Always Run|hello-world/i;
    const hits = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const raw = (walker.currentNode.nodeValue || "").trim();
      if (!raw || raw.length > 120) continue;
      if (!needle.test(raw) && !/^(Skip|Run|Always Run)$/i.test(raw)) continue;
      let el = walker.currentNode.parentElement;
      // climb to a meaningful block
      let block = el;
      for (let i = 0; i < 12 && block; i++) {
        const c = (block.className && block.className.toString) ? block.className.toString() : "";
        if (/tool-call|approval|review|control-row|composer-|ui-button|button/i.test(c)) break;
        block = block.parentElement;
      }
      const r = (block || el).getBoundingClientRect();
      hits.push({
        raw,
        leafTag: el?.tagName,
        leafCls: ((el?.className && el.className.toString) ? el.className.toString() : "").slice(0, 120),
        blockTag: block?.tagName,
        blockCls: ((block?.className && block.className.toString) ? block.className.toString() : "").slice(0, 200),
        blockText: ((block?.innerText) || "").trim().slice(0, 280),
        blockHtml: ((block?.innerHTML) || "").slice(0, 900),
        w: Math.round(r.width),
        h: Math.round(r.height),
        top: Math.round(r.top),
      });
      if (hits.length >= 40) break;
    }

    // Also scan for ui-button with short labels
    const uiButtons = [...document.querySelectorAll("[class*='ui-button'], [class*='Button']")].filter((el) => {
      const t = (el.innerText || "").trim();
      return t.length > 0 && t.length < 40 && /skip|run|always/i.test(t);
    }).slice(0, 20).map((el) => {
      const r = el.getBoundingClientRect();
      return {
        tag: el.tagName,
        role: el.getAttribute("role"),
        text: (el.innerText || "").trim().slice(0, 60),
        aria: el.getAttribute("aria-label"),
        cls: ((el.className && el.className.toString) ? el.className.toString() : "").slice(0, 180),
        w: Math.round(r.width),
        h: Math.round(r.height),
        top: Math.round(r.top),
        outer: el.outerHTML.slice(0, 350),
      };
    });

    return {
      title: document.title,
      hitCount: hits.length,
      hits: hits.slice(0, 25),
      uiButtons,
    };
  })()`);
  client.close();
  fs.writeFileSync(
    outPath,
    JSON.stringify({ at: new Date().toISOString(), target: target.title, dump }, null, 2),
  );
  console.log(
    JSON.stringify(
      {
        target: target.title,
        hitCount: dump.hitCount,
        uiButtons: dump.uiButtons,
        hits: (dump.hits || []).slice(0, 15).map((h) => ({
          raw: h.raw,
          leafCls: h.leafCls,
          blockCls: h.blockCls,
          top: h.top,
          blockText: h.blockText?.slice(0, 160),
          blockHtml: h.blockHtml?.slice(0, 350),
        })),
      },
      null,
      2,
    ),
  );
}
