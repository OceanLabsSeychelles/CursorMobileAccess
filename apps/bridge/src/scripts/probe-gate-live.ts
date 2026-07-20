/**
 * Fast-poll for ui-tool-approval-gate while a Smart Mode prompt is open.
 */
import fs from "node:fs";
import { loadConfig } from "../config.js";
import { isWorkbenchTarget, listCdpTargets } from "../cdp/discover.js";
import { CdpClient } from "../cdp/client.js";
import { EXTRACT_ACTIONS_SOURCE } from "../extract/actions-source.js";

const outPath = new URL("../../../../tmp-gate-live.json", import.meta.url);
const config = loadConfig();
const deadline = Date.now() + 180_000;
console.log("[gate] polling for ui-tool-approval-gate…");

while (Date.now() < deadline) {
  try {
    const targets = (await listCdpTargets(config.cdpHttpUrl)).filter(isWorkbenchTarget);
    const ws = targets[0]?.webSocketDebuggerUrl;
    if (!ws) {
      await new Promise((r) => setTimeout(r, 400));
      continue;
    }
    const client = new CdpClient(ws);
    await client.connect();
    const dump = await client.evaluate(`(() => {
      const gates = [...document.querySelectorAll("[class*='ui-tool-approval-gate'], [class*='tool-approval-gate']")];
      const actions = gates.flatMap((g) =>
        [...g.querySelectorAll("button, [role='button'], [tabindex]")].map((el) => {
          const r = el.getBoundingClientRect();
          return {
            text: (el.innerText || "").trim().slice(0, 60),
            aria: el.getAttribute("aria-label"),
            cls: ((el.className && el.className.toString) ? el.className.toString() : "").slice(0, 160),
            tag: el.tagName,
            role: el.getAttribute("role"),
            w: Math.round(r.width),
            h: Math.round(r.height),
            top: Math.round(r.top),
            outer: el.outerHTML.slice(0, 300),
          };
        })
      );
      return { gateCount: gates.length, actions, gateText: gates.map((g) => (g.innerText || "").trim().slice(0, 200)) };
    })()`);
    const extracted = await client.evaluate(EXTRACT_ACTIONS_SOURCE);
    client.close();

    if (dump.gateCount > 0 || (dump.actions || []).length > 0) {
      fs.writeFileSync(outPath, JSON.stringify({ at: new Date().toISOString(), dump, extracted }, null, 2));
      console.log("[gate] FOUND");
      console.log(JSON.stringify({ dump, extracted }, null, 2));
      process.exit(0);
    }
    if (Date.now() % 5000 < 500) console.log("[gate] waiting…");
  } catch (e) {
    console.log("[gate] err", (e as Error).message);
  }
  await new Promise((r) => setTimeout(r, 400));
}
console.log("[gate] timeout");
process.exit(2);
