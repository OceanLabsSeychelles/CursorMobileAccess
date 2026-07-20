/**
 * Dump prompt-header tray / AskQuestion option DOM for extractor tuning.
 */
import fs from "node:fs";
import { loadConfig } from "../config.js";
import { isWorkbenchTarget, listCdpTargets } from "../cdp/discover.js";
import { CdpClient } from "../cdp/client.js";
import { EXTRACT_ACTIONS_SOURCE } from "../extract/actions-source.js";

const outPath = new URL("../../../../tmp-tray-probe.json", import.meta.url);
const config = loadConfig();
const targets = (await listCdpTargets(config.cdpHttpUrl)).filter(isWorkbenchTarget);
if (!targets[0]?.webSocketDebuggerUrl) {
  console.error("No CDP workbench target");
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
      tabIndex: el.getAttribute("tabindex"),
      cls: (el.className && el.className.toString ? el.className.toString() : "").slice(0, 220),
      text: (el.innerText || "").trim().slice(0, 160),
      w: Math.round(r.width),
      h: Math.round(r.height),
      top: Math.round(r.top),
    };
  }

  const trays = [...document.querySelectorAll(
    ".ui-prompt-input-header-tray, [class*='ui-prompt-input-header-tray'], [class*='composer-questionnaire-toolbar']"
  )];

  const optionLeaves = [...document.querySelectorAll(
    "[class*='tray-option'], [class*='questionnaire-toolbar-option']"
  )];

  const options = optionLeaves.map((el) => {
    let click = el;
    for (let i = 0; i < 6 && click; i++) {
      if (
        click.matches &&
        (click.matches("button, [role='button'], [role='option'], [role='radio'], a") ||
          click.getAttribute("tabindex") != null ||
          /tray-option(?!__)/i.test(click.className?.toString?.() || ""))
      ) {
        break;
      }
      click = click.parentElement;
    }
    return { leaf: summarize(el), click: summarize(click), clickSame: click === el };
  });

  const traySummaries = trays.map((t) => ({
    root: summarize(t),
    text: (t.innerText || "").trim().slice(0, 500),
    optionRows: [...t.querySelectorAll(
      "[class*='tray-option'], button, [role='button'], [role='option']"
    )].slice(0, 40).map(summarize),
  }));

  return {
    trayCount: trays.length,
    optionLeafCount: optionLeaves.length,
    options: options.slice(0, 40),
    trays: traySummaries.slice(0, 3),
  };
})()`);

const actions = await client.evaluate(EXTRACT_ACTIONS_SOURCE);
client.close();

const payload = {
  at: new Date().toISOString(),
  dump,
  extractedActionCount: actions?.actions?.length ?? 0,
  extractedActions: actions?.actions ?? [],
};
fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
console.log(
  `[probe-tray] trays=${dump.trayCount} optionLeaves=${dump.optionLeafCount} extracted=${payload.extractedActionCount}`,
);
console.log(JSON.stringify(payload.extractedActions, null, 2));
