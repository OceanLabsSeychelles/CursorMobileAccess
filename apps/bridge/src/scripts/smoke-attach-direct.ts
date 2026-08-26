/**
 * End-to-end attach_files via CDP (no WebSocket). Does not submit unless --submit.
 */
import { loadConfig } from "../config.js";
import { isWorkbenchTarget, listCdpTargets } from "../cdp/discover.js";
import { CdpClient } from "../cdp/client.js";
import { attachComposerFiles } from "../commands/attach-files.js";

const submit = process.argv.includes("--submit");
const config = loadConfig();
const targets = (await listCdpTargets(config.cdpHttpUrl)).filter(isWorkbenchTarget);
if (!targets[0]?.webSocketDebuggerUrl) {
  console.error("No workbench target");
  process.exit(1);
}

const client = new CdpClient(targets[0].webSocketDebuggerUrl);
await client.connect();

const result = await attachComposerFiles(
  client,
  [
    {
      name: "smoke.png",
      mime: "image/png",
      dataBase64:
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    },
  ],
  { submit },
);

console.log(JSON.stringify(result, null, 2));
client.close();
process.exit(result.ok ? 0 : 1);
