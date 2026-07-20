/**
 * Dump composer-bar send controls.
 */
import { loadConfig } from "../config.js";
import { isWorkbenchTarget, listCdpTargets } from "../cdp/discover.js";
import { CdpClient } from "../cdp/client.js";

const config = loadConfig();
const targets = (await listCdpTargets(config.cdpHttpUrl)).filter(isWorkbenchTarget);
if (!targets[0]?.webSocketDebuggerUrl) {
  console.error("no CDP");
  process.exit(1);
}
const client = new CdpClient(targets[0].webSocketDebuggerUrl);
await client.connect();
const dump = await client.evaluate(`(() => {
  const bar = document.querySelector(".composer-bar");
  if (!bar) return { err: "no bar" };
  const btns = [...bar.querySelectorAll("button, [role='button'], [aria-label]")].map((el) => ({
    tag: el.tagName,
    text: (el.innerText || "").trim().slice(0, 40),
    aria: el.getAttribute("aria-label"),
    cls: ((el.className && el.className.toString) ? el.className.toString() : "").slice(0, 160),
    type: el.getAttribute("type"),
    disabled: el.getAttribute("disabled") != null || el.getAttribute("aria-disabled") === "true",
  }));
  return { count: btns.length, btns };
})()`);
console.log(JSON.stringify(dump, null, 2));
client.close();
