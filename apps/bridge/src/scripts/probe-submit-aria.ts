import { loadConfig } from "../config.js";
import { isWorkbenchTarget, listCdpTargets } from "../cdp/discover.js";
import { CdpClient } from "../cdp/client.js";

const config = loadConfig();
const targets = (await listCdpTargets(config.cdpHttpUrl)).filter(isWorkbenchTarget);
const page = targets.find((t) => /agents/i.test(t.title)) ?? targets[0];
const client = new CdpClient(page!.webSocketDebuggerUrl!);
await client.connect();

const phase = await client.evaluate(`(() => {
  const btns = [...document.querySelectorAll(".ui-prompt-input-submit-button")].map(b => b.getAttribute("aria-label"));
  const editor = document.querySelector('[data-editor-owns-history="true"]');
  return {
    submitArias: btns,
    editorText: (editor && editor.innerText || "").slice(0,40),
    generating: !!document.querySelector("[class*='stop'], [aria-label*='Stop']"),
  };
})()`);
console.log(phase);
client.close();
