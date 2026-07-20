/**
 * Screenshot Agents Window + report whether Skip/Always Run are visible.
 * Focuses Cursor IDE remote chat first.
 */
import fs from "node:fs";
import { loadConfig } from "../config.js";
import { isWorkbenchTarget, listCdpTargets } from "../cdp/discover.js";
import { CdpClient } from "../cdp/client.js";

const shotPath = new URL("../../../../tmp-agents-shot.png", import.meta.url);
const config = loadConfig();
const targets = (await listCdpTargets(config.cdpHttpUrl)).filter(isWorkbenchTarget);
const client = new CdpClient(targets[0]!.webSocketDebuggerUrl!);
await client.connect();

await client.evaluate(`(() => {
  const buttons = [...document.querySelectorAll("[data-sidebar-menu-button], .ui-sidebar-menu-button")];
  const el = buttons.find((b) => /Cursor IDE remote chat/i.test(b.innerText || ""));
  if (el) el.click();
})()`);
await new Promise((r) => setTimeout(r, 700));

await client.send("Page.enable", {});
const shot = (await client.send("Page.captureScreenshot", {
  format: "png",
  fromSurface: true,
})) as { data?: string };

if (shot.data) {
  fs.writeFileSync(shotPath, Buffer.from(shot.data, "base64"));
  console.log("wrote", shotPath.pathname || shotPath.href);
}

const probe = await client.evaluate(`(() => {
  const text = document.body.innerText || "";
  return {
    hasAuto: /Auto-review/i.test(text),
    hasHello: /hello-world/i.test(text),
    hasSkip: /\\bSkip\\b/.test(text),
    hasAlways: /Always\\s+Run/.test(text),
    hasGate: !!document.querySelector("[class*='ui-tool-approval-gate'], [class*='tool-approval-gate']"),
    titleHint: (document.title || "").slice(0, 80),
  };
})()`);
console.log(JSON.stringify(probe, null, 2));
client.close();
