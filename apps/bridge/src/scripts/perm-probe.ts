/**
 * Poll extracted actions for a short window (permission Run/Skip test).
 */
import { loadConfig } from "../config.js";
import { isWorkbenchTarget, listCdpTargets } from "../cdp/discover.js";
import { CdpClient } from "../cdp/client.js";
import { EXTRACT_ACTIONS_SOURCE } from "../extract/actions-source.js";

const config = loadConfig();
const deadline = Date.now() + 45_000;
console.log("[perm-probe] watching for Run/Skip/Allow…");

while (Date.now() < deadline) {
  try {
    const targets = (await listCdpTargets(config.cdpHttpUrl)).filter(
      isWorkbenchTarget,
    );
    const wsUrl = targets[0]?.webSocketDebuggerUrl;
    if (!wsUrl) {
      await new Promise((r) => setTimeout(r, 1000));
      continue;
    }
    const client = new CdpClient(wsUrl);
    await client.connect();
    const raw = await client.evaluate(EXTRACT_ACTIONS_SOURCE);
    client.close();
    const acts = (raw?.actions || []).map(
      (a: { kind: string; label: string }) => ({
        kind: a.kind,
        label: a.label,
      }),
    );
    const interesting = acts.filter((a) =>
      /run|skip|allow|approve|reject/i.test(a.kind + " " + a.label),
    );
    if (interesting.length) {
      console.log("[perm-probe] FOUND", JSON.stringify(interesting));
      process.exit(0);
    }
    console.log(`[perm-probe] actions=${acts.length}`);
  } catch (err) {
    console.log("[perm-probe] err", (err as Error).message);
  }
  await new Promise((r) => setTimeout(r, 1000));
}
console.log("[perm-probe] timeout — no Run/Skip/Allow seen");
process.exit(2);
