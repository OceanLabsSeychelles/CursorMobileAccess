/**
 * Dump selection + freeform questionnaire DOM after an option is chosen in Cursor.
 */
import fs from "node:fs";
import { loadConfig } from "../config.js";
import { isWorkbenchTarget, listCdpTargets } from "../cdp/discover.js";
import { CdpClient } from "../cdp/client.js";
import { EXTRACT_ACTIONS_SOURCE } from "../extract/actions-source.js";

const outPath = new URL("../../../../tmp-freeform-probe.json", import.meta.url);
const config = loadConfig();
const targets = (await listCdpTargets(config.cdpHttpUrl)).filter(isWorkbenchTarget);
if (!targets[0]?.webSocketDebuggerUrl) {
  console.error("No CDP target");
  process.exit(1);
}

const client = new CdpClient(targets[0].webSocketDebuggerUrl);
await client.connect();

const dump = await client.evaluate(`(() => {
  function attrs(el) {
    if (!el) return null;
    const out = {};
    for (const a of el.attributes) out[a.name] = a.value.slice(0, 120);
    return out;
  }
  function summarize(el) {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      tag: el.tagName,
      cls: (el.className?.toString?.() || "").slice(0, 220),
      text: (el.innerText || "").trim().slice(0, 120),
      attrs: attrs(el),
      w: Math.round(r.width),
      h: Math.round(r.height),
    };
  }

  const options = [...document.querySelectorAll("button.ui-tray-option, [class*='ui-tray-option']")]
    .filter((el) => {
      const c = el.className?.toString?.() || "";
      return /ui-tray-option(?!__)/.test(c) || el.matches("button.ui-tray-option");
    })
    .map((el) => ({
      ...summarize(el),
      badge: el.querySelector("[class*='badge']")?.innerText?.trim(),
      label: el.querySelector("[class*='label']")?.innerText?.trim(),
      freeformChild: summarize(el.querySelector("[class*='freeform'], textarea, input, [contenteditable='true']")),
    }));

  const freeforms = [...document.querySelectorAll(
    "[class*='freeform'], [class*='questionnaire-freeform'], textarea, input[type='text']"
  )].filter((el) => {
    const tray = el.closest("[class*='tray'], [class*='questionnaire']");
    return !!tray;
  }).map(summarize);

  const tray = document.querySelector(".ui-tray, [class*='glass-questionnaire-tray'], .ui-prompt-input-header-tray");

  return {
    optionCount: options.length,
    options,
    freeforms: freeforms.slice(0, 20),
    trayText: (tray?.innerText || "").trim().slice(0, 800),
  };
})()`);

const actions = await client.evaluate(EXTRACT_ACTIONS_SOURCE);
client.close();

const payload = { at: new Date().toISOString(), dump, actions: actions?.actions ?? [] };
fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
console.log(JSON.stringify({ optionCount: dump.optionCount, freeforms: dump.freeforms?.length, actions: payload.actions.map((a) => ({ kind: a.kind, label: a.label, selected: a.selected, by: a.locator?.by })) }, null, 2));
