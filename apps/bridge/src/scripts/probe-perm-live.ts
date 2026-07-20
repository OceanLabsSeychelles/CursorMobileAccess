/**
 * Poll until Skip / Always Run / Run controls exist as real buttons (not chat text).
 * Leaves dump in tmp-perm-live.json when found.
 */
import fs from "node:fs";
import { loadConfig } from "../config.js";
import { isWorkbenchTarget, listCdpTargets } from "../cdp/discover.js";
import { CdpClient } from "../cdp/client.js";
import { EXTRACT_ACTIONS_SOURCE } from "../extract/actions-source.js";

const outPath = new URL("../../../../tmp-perm-live.json", import.meta.url);
const config = loadConfig();
const deadline = Date.now() + 120_000;
console.log("[perm-live] waiting for permission buttons…");

while (Date.now() < deadline) {
  try {
    const targets = (await listCdpTargets(config.cdpHttpUrl)).filter(isWorkbenchTarget);
    const wsUrl = targets[0]?.webSocketDebuggerUrl;
    if (!wsUrl) {
      await new Promise((r) => setTimeout(r, 1500));
      continue;
    }
    const client = new CdpClient(wsUrl);
    await client.connect();

    const dump = await client.evaluate(`(() => {
      function box(el) {
        const r = el.getBoundingClientRect();
        return {
          tag: el.tagName,
          role: el.getAttribute("role"),
          text: (el.innerText || "").trim().slice(0, 80),
          aria: el.getAttribute("aria-label"),
          cls: ((el.className && el.className.toString) ? el.className.toString() : "").slice(0, 200),
          w: Math.round(r.width),
          h: Math.round(r.height),
          top: Math.round(r.top),
          path: (() => {
            const parts = [];
            let cur = el;
            for (let i = 0; cur && i < 6; i++) {
              const c = ((cur.className && cur.className.toString) ? cur.className.toString() : "")
                .split(/\\s+/).filter(Boolean).slice(0, 3).join(".");
              parts.push(cur.tagName.toLowerCase() + (c ? "." + c : ""));
              cur = cur.parentElement;
            }
            return parts.join(" < ");
          })(),
        };
      }

      const prefer = [...document.querySelectorAll(
        ".composer-run-button, .composer-skip-button, [class*='composer-run-button'], [class*='composer-skip-button'], .composer-tool-call-control-row button, .composer-tool-call-control-row [role='button'], .composer-tool-call-allowlist-button-wrapper button"
      )].map(box);

      const labeled = [...document.querySelectorAll("button, [role='button']")].filter((el) => {
        const t = ((el.innerText || "") + " " + (el.getAttribute("aria-label") || "")).replace(/\\s+/g, " ").trim();
        // Exact-ish labels only — ignore long chat bubbles mentioning these words
        return /^(skip|run|always\\s+run(\\s+selected)?|always\\s+run\\b.{0,40})$/i.test(t) ||
          /^(skip|run|always\\s+run)\\b/i.test(t) && t.length < 48;
      }).map(box);

      const rows = [...document.querySelectorAll(
        ".composer-tool-call-control-row, [class*='composer-tool-call-control'], [class*='allowlist']"
      )].slice(0, 15).map((el) => ({
        text: (el.innerText || "").trim().slice(0, 160),
        ...box(el),
      }));

      return {
        preferCount: prefer.length,
        labeledCount: labeled.length,
        prefer,
        labeled,
        rows,
      };
    })()`);

    const extracted = await client.evaluate(EXTRACT_ACTIONS_SOURCE);
    client.close();

    const hit =
      dump.preferCount > 0 ||
      dump.labeledCount > 0 ||
      (extracted?.actions || []).some((a) =>
        /run|skip|allow/i.test(a.kind || "") || /run|skip/i.test(a.label || ""),
      );

    if (hit) {
      const payload = { at: new Date().toISOString(), dump, extracted };
      fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
      console.log("[perm-live] FOUND");
      console.log(JSON.stringify({
        preferCount: dump.preferCount,
        labeledCount: dump.labeledCount,
        labeled: (dump.labeled || []).slice(0, 12),
        prefer: (dump.prefer || []).slice(0, 12),
        actions: extracted?.actions || extracted,
      }, null, 2));
      process.exit(0);
    }
    console.log("[perm-live] not yet");
  } catch (err) {
    console.log("[perm-live] err", (err as Error).message);
  }
  await new Promise((r) => setTimeout(r, 1500));
}

console.log("[perm-live] timeout");
process.exit(2);
