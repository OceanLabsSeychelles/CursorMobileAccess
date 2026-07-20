/**
 * Dump Cursor workbench DOM snippets for extractor tuning.
 * Usage: npx tsx src/scripts/dump-dom.ts
 * Requires Cursor with --remote-debugging-port=9222
 */
import { loadConfig } from "../config.js";
import { discoverWindows, isWorkbenchTarget, listCdpTargets } from "../cdp/discover.js";
import { CdpClient } from "../cdp/client.js";

const config = loadConfig();

const targets = await listCdpTargets(config.cdpHttpUrl);
const workbenches = targets.filter(isWorkbenchTarget);
console.log(`Found ${workbenches.length} workbench target(s)`);

if (!workbenches[0]?.webSocketDebuggerUrl) {
  console.error("No webSocketDebuggerUrl — is Cursor running with CDP?");
  process.exit(1);
}

const client = new CdpClient(workbenches[0].webSocketDebuggerUrl);
await client.connect();

const summary = await client.evaluate<{
  flatCount: number;
  sampleAttrs: Array<Record<string, string | null>>;
  bodyTextLen: number;
}>(`(() => {
  const nodes = [...document.querySelectorAll('[data-flat-index]')];
  return {
    flatCount: nodes.length,
    sampleAttrs: nodes.slice(0, 8).map(n => ({
      flat: n.getAttribute('data-flat-index'),
      role: n.getAttribute('data-message-role'),
      kind: n.getAttribute('data-message-kind'),
      classes: n.className?.toString?.().slice(0, 120) ?? null,
    })),
    bodyTextLen: document.body?.innerText?.length ?? 0,
  };
})()`);

console.log(JSON.stringify({ windows: await discoverWindows(config.cdpHttpUrl), summary }, null, 2));
client.close();
