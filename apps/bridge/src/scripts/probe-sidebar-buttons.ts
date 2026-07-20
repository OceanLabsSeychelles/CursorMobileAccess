import fs from "node:fs";
import { loadConfig } from "../config.js";
import { isWorkbenchTarget, listCdpTargets } from "../cdp/discover.js";
import { CdpClient } from "../cdp/client.js";

const outPath = new URL("../../../../tmp-sidebar-buttons.json", import.meta.url);
const config = loadConfig();
const targets = (await listCdpTargets(config.cdpHttpUrl)).filter(isWorkbenchTarget);
const client = new CdpClient(targets[0]!.webSocketDebuggerUrl!);
await client.connect();

const dump = await client.evaluate(`(() => {
  const buttons = [...document.querySelectorAll("button.ui-sidebar-menu-button, [class*='ui-sidebar-menu-button']")];
  return buttons.map((el, i) => {
    const attrs = {};
    for (const a of el.attributes) attrs[a.name] = a.value.slice(0, 120);
    return {
      i,
      text: (el.innerText || "").trim().slice(0, 120),
      cls: (el.className?.toString?.() || "").slice(0, 220),
      attrs,
      parentCls: (el.parentElement?.className?.toString?.() || "").slice(0, 140),
      ariaCurrent: el.getAttribute("aria-current"),
      dataState: el.getAttribute("data-state"),
      dataActive: el.getAttribute("data-active"),
      dataSelected: el.getAttribute("data-selected"),
      pressed: el.getAttribute("aria-pressed"),
      selected: el.getAttribute("aria-selected"),
    };
  });
})()`);

fs.writeFileSync(outPath, JSON.stringify(dump, null, 2));
console.log(JSON.stringify(dump, null, 2));
client.close();
