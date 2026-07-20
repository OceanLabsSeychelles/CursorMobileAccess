/**
 * Probe Agents window sidebar / chat tab DOM for switching.
 */
import fs from "node:fs";
import { loadConfig } from "../config.js";
import { isWorkbenchTarget, listCdpTargets } from "../cdp/discover.js";
import { CdpClient } from "../cdp/client.js";
import { EXTRACT_COMPOSER_UI_SOURCE } from "../extract/composer-source.js";

const outPath = new URL("../../../../tmp-tabs-probe.json", import.meta.url);
const config = loadConfig();
const targets = (await listCdpTargets(config.cdpHttpUrl)).filter(isWorkbenchTarget);
if (!targets[0]?.webSocketDebuggerUrl) {
  console.error("No CDP target");
  process.exit(1);
}

const client = new CdpClient(targets[0].webSocketDebuggerUrl);
await client.connect();

const dump = await client.evaluate(`(() => {
  function summarize(el) {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      tag: el.tagName,
      role: el.getAttribute("role"),
      aria: el.getAttribute("aria-label"),
      ariaSelected: el.getAttribute("aria-selected"),
      title: el.getAttribute("title"),
      tabIndex: el.getAttribute("tabindex"),
      cls: (el.className?.toString?.() || "").slice(0, 220),
      text: (el.innerText || "").trim().slice(0, 100),
      w: Math.round(r.width),
      h: Math.round(r.height),
      top: Math.round(r.top),
      left: Math.round(r.left),
    };
  }

  const selectors = [
    ".agent-sidebar-cell",
    "[class*='agent-sidebar-cell']",
    "[class*='agent-sidebar']",
    ".chat-title-tab-row [role='tab']",
    ".chat-title-tab-tray-root button",
    "[class*='chat-title-tab']",
    "[class*='AgentsSidebar']",
    "[class*='composer-sidebar']",
    "[data-testid*='agent']",
    "[data-testid*='chat']",
  ];

  const found = {};
  for (const sel of selectors) {
    const nodes = [...document.querySelectorAll(sel)];
    found[sel] = {
      count: nodes.length,
      sample: nodes.slice(0, 8).map(summarize),
    };
  }

  // Broad: any clickable in left pane-ish area
  const leftish = [...document.querySelectorAll("button, [role='button'], [role='tab'], [role='treeitem'], [role='option']")]
    .filter((el) => {
      const r = el.getBoundingClientRect();
      const t = (el.innerText || el.getAttribute("aria-label") || "").trim();
      return r.width > 20 && r.height > 12 && r.left < 420 && t.length > 0 && t.length < 80;
    })
    .slice(0, 40)
    .map(summarize);

  return { found, leftish };
})()`);

const extracted = await client.evaluate(EXTRACT_COMPOSER_UI_SOURCE);
client.close();

const payload = {
  at: new Date().toISOString(),
  dump,
  extractedTabs: extracted?.tabs ?? [],
};
fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
console.log(JSON.stringify({
  tabCount: payload.extractedTabs.length,
  tabs: payload.extractedTabs,
  leftish: (dump.leftish || []).slice(0, 15).map((n) => ({ text: n.text, aria: n.aria, cls: n.cls?.slice(0, 80), role: n.role })),
  hits: Object.fromEntries(Object.entries(dump.found).filter(([, v]) => v.count > 0).map(([k, v]) => [k, v.count])),
}, null, 2));
