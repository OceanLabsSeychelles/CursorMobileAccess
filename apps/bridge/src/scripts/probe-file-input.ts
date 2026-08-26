import { loadConfig } from "../config.js";
import { isWorkbenchTarget, listCdpTargets } from "../cdp/discover.js";
import { CdpClient } from "../cdp/client.js";

const config = loadConfig();
const targets = (await listCdpTargets(config.cdpHttpUrl)).filter(isWorkbenchTarget);
if (!targets[0]?.webSocketDebuggerUrl) {
  console.error("No workbench target");
  process.exit(1);
}

const client = new CdpClient(targets[0].webSocketDebuggerUrl);
await client.connect();

const r = await client.evaluate(`(() => {
  const inputs = [...document.querySelectorAll("input[type=file]")].map((el) => ({
    parent: el.closest(".ui-prompt-input")
      ? "ui-prompt-input"
      : el.closest(".composer-bar")
        ? "composer-bar"
        : "other",
    className: (el.className?.toString?.() || "").slice(0, 120),
    accept: el.getAttribute("accept"),
    hidden: el.hidden || getComputedStyle(el).display === "none",
  }));
  return { count: inputs.length, inputs };
})()`);

console.log(JSON.stringify(r, null, 2));
client.close();
