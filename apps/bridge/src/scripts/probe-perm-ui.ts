/**
 * Probe DOM for Run / Skip / Always Run permission UI.
 */
import fs from "node:fs";
import { loadConfig } from "../config.js";
import { isWorkbenchTarget, listCdpTargets } from "../cdp/discover.js";
import { CdpClient } from "../cdp/client.js";
import { EXTRACT_ACTIONS_SOURCE } from "../extract/actions-source.js";
import { EXTRACT_COMPOSER_UI_SOURCE } from "../extract/composer-source.js";

const outPath = new URL("../../../../tmp-perm-ui.json", import.meta.url);
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
      type: el.getAttribute("type"),
      aria: el.getAttribute("aria-label"),
      cls: (el.className?.toString?.() || "").slice(0, 220),
      text: (el.innerText || "").trim().slice(0, 160),
      w: Math.round(r.width),
      h: Math.round(r.height),
      top: Math.round(r.top),
      visible: r.width > 4 && r.height > 4 && r.bottom > 0 && r.top < innerHeight,
    };
  }

  const hitText = /\\b(skip|always\\s*run|run|allow|accept|reject|deny)\\b/i;
  const candidates = [...document.querySelectorAll("button, [role='button'], a, [class*='run'], [class*='skip'], [class*='command'], [data-react-transcript-row-kind]")];
  const matches = candidates
    .map(summarize)
    .filter((n) => n && (hitText.test(n.text + " " + (n.aria || "")) || /composer-run|composer-skip|always-run|command-upsert/i.test(n.cls)))
    .slice(0, 60);

  // Find transcript rows that mention Skip/Run together
  const rows = [...document.querySelectorAll("[data-react-transcript-row-kind], [data-message-role], [class*='composer-tool'], [class*='command']")]
    .filter((el) => /skip|always\\s*run|\\brun\\b/i.test(el.innerText || ""))
    .slice(-8)
    .map((el) => ({
      kind: el.getAttribute("data-react-transcript-row-kind"),
      role: el.getAttribute("data-message-role"),
      cls: (el.className?.toString?.() || "").slice(0, 180),
      text: (el.innerText || "").trim().slice(0, 400),
      buttons: [...el.querySelectorAll("button, [role='button'], [class*='button']")].slice(0, 20).map(summarize),
      allCls: [...new Set(
        [...el.querySelectorAll("[class]")].flatMap((n) =>
          (n.className.toString() || "").split(/\\s+/).filter((c) => /run|skip|allow|command|button|action|permission|tool/i.test(c))
        )
      )].slice(0, 60),
    }));

  return { matchCount: matches.length, matches, rows };
})()`);

const actions = await client.evaluate(EXTRACT_ACTIONS_SOURCE);
const ui = await client.evaluate(EXTRACT_COMPOSER_UI_SOURCE);
client.close();

const payload = {
  at: new Date().toISOString(),
  dump,
  extractedActions: actions?.actions ?? [],
  lastTimeline: (ui?.timeline || []).slice(-6),
};
fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
console.log(JSON.stringify({
  matchCount: dump.matchCount,
  actions: payload.extractedActions,
  rowSummaries: (dump.rows || []).map((r) => ({
    kind: r.kind,
    text: (r.text || "").slice(0, 120),
    buttonCount: (r.buttons || []).length,
    buttonLabels: (r.buttons || []).map((b) => b?.text || b?.aria).filter(Boolean),
    allCls: r.allCls,
  })),
}, null, 2));
