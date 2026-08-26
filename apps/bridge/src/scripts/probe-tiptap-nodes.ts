import { loadConfig } from "../config.js";
import { isWorkbenchTarget, listCdpTargets } from "../cdp/discover.js";
import { CdpClient } from "../cdp/client.js";

const config = loadConfig();
const targets = (await listCdpTargets(config.cdpHttpUrl)).filter(isWorkbenchTarget);
const page = targets.find((t) => /agents/i.test(t.title)) ?? targets[0];
const client = new CdpClient(page!.webSocketDebuggerUrl!);
await client.connect();
const r = await client.evaluate(`(() => {
  const nodes = [...document.querySelectorAll('[data-editor-owns-history="true"], .tiptap.ProseMirror')];
  const first = document.querySelector('[data-editor-owns-history="true"]');
  return {
    count: nodes.length,
    nodes: nodes.map((n, i) => {
      const r = n.getBoundingClientRect();
      return {
        i,
        isFirstQuery: n === first,
        text: (n.innerText || "").slice(0, 40),
        readonlyAttr: !!n.closest("[data-prompt-input-tiptap-readonly], .composer-human-message"),
        inBar: !!n.closest(".composer-bar"),
        inPrompt: !!n.closest(".ui-prompt-input"),
        w: Math.round(r.width),
        h: Math.round(r.height),
        t: Math.round(r.top),
      };
    }),
  };
})()`);
console.log(JSON.stringify(r, null, 2));
client.close();
