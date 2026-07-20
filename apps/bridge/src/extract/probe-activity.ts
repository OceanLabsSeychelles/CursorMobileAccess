import { loadConfig } from "../config.js";
import { isWorkbenchTarget, listCdpTargets } from "../cdp/discover.js";
import { CdpClient } from "../cdp/client.js";

const config = loadConfig();
const targets = (await listCdpTargets(config.cdpHttpUrl)).filter(isWorkbenchTarget);
const client = new CdpClient(targets[0]!.webSocketDebuggerUrl!);
await client.connect();

const sample = await client.evaluate(`(() => {
  const rows = [...document.querySelectorAll("[data-react-transcript-row-kind]")].slice(-15).map((el) => ({
    kind: el.getAttribute("data-react-transcript-row-kind"),
    key: (el.getAttribute("data-react-transcript-row-key") || "").slice(0, 80),
    summary: el.getAttribute("data-activity-group-summary"),
    line: el.getAttribute("data-activity-group-summary-line"),
    accessible: el.getAttribute("data-activity-group-summary-accessible"),
    text: (el.innerText || "").trim().slice(0, 220),
    cls: (el.className?.toString?.() || "").slice(0, 100),
  }));
  return rows;
})()`);

console.log(JSON.stringify(sample, null, 2));
client.close();
