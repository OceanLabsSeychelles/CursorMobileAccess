import { loadConfig } from "../config.js";
import { isWorkbenchTarget, listCdpTargets } from "../cdp/discover.js";
import { CdpClient } from "../cdp/client.js";

const config = loadConfig();
const targets = (await listCdpTargets(config.cdpHttpUrl)).filter(isWorkbenchTarget);
const client = new CdpClient(targets[0]!.webSocketDebuggerUrl!);
await client.connect();

const probe = await client.evaluate(`(() => {
  const blocks = [...document.querySelectorAll(".composer-ask-question-tool-call-block, [class*='ask-question']")];
  return blocks.slice(0, 5).map((block) => {
    const all = [...block.querySelectorAll("*")].slice(0, 80).map((el) => ({
      tag: el.tagName,
      cls: (el.className && el.className.toString ? el.className.toString() : "").slice(0, 100),
      role: el.getAttribute("role"),
      type: el.getAttribute("type"),
      aria: el.getAttribute("aria-label"),
      text: (el.innerText || "").trim().slice(0, 100),
    })).filter((x) => x.cls || x.role || x.text);
    const uniqueCls = [...new Set(
      [...block.querySelectorAll("[class]")].map((el) => (el.className.toString() || "").split(/\\s+/)).flat().filter((c) => /question|option|answer|radio|choice|select/i.test(c))
    )];
    return { uniqueCls, sample: all.slice(0, 40) };
  });
})()`);

console.log(JSON.stringify(probe, null, 2));
client.close();
