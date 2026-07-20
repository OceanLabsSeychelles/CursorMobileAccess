/**
 * Poll until a pending AskQuestion tray appears with answer options.
 * Leave an AskQuestion unanswered in Agents Window while this runs.
 */
import fs from "node:fs";
import { loadConfig } from "../config.js";
import { isWorkbenchTarget, listCdpTargets } from "../cdp/discover.js";
import { CdpClient } from "../cdp/client.js";
import { EXTRACT_ACTIONS_SOURCE } from "../extract/actions-source.js";

const outPath = new URL("../../../../tmp-ask-probe.json", import.meta.url);
const config = loadConfig();
const deadline = Date.now() + 180_000;

console.log("[ask-probe] waiting for pending AskQuestion tray options…");

while (Date.now() < deadline) {
  try {
    const targets = (await listCdpTargets(config.cdpHttpUrl)).filter(
      isWorkbenchTarget,
    );
    const wsUrl = targets[0]?.webSocketDebuggerUrl;
    if (!wsUrl) {
      await new Promise((r) => setTimeout(r, 1500));
      continue;
    }

    const client = new CdpClient(wsUrl);
    await client.connect();

    const dump = await client.evaluate(`(() => {
      function vis(el) {
        const r = el.getBoundingClientRect();
        return r.width > 8 && r.height > 8 && r.bottom > 0 && r.top < innerHeight;
      }
      // Live pending options live in the prompt-header tray, not transcript history
      const trays = [...document.querySelectorAll(
        ".ui-prompt-input-header-tray, [class*='ui-prompt-input-header-tray'], [class*='composer-questionnaire-toolbar']"
      )];
      const optionLeaves = [...document.querySelectorAll(
        "[class*='ui-tray-option__label'], [class*='ui-tray-option__badge'], [class*='composer-questionnaire-toolbar-option']"
      )].filter(vis);
      if (!trays.length && !optionLeaves.length) return { found: false };

      const target = trays[trays.length - 1] || optionLeaves[0]?.closest("[class*='tray']") || optionLeaves[0];
      if (!target) return { found: false };

      const allCls = [...new Set(
        [...target.querySelectorAll("[class]")].flatMap((el) =>
          (el.className.toString() || "").split(/\\s+/).filter(Boolean)
        )
      )].filter((c) => /question|option|answer|choice|tray|footer|badge|label/i.test(c)).slice(0, 80);

      const nodes = [...target.querySelectorAll("*")].filter(vis).slice(0, 120).map((el) => ({
        tag: el.tagName,
        role: el.getAttribute("role"),
        type: el.getAttribute("type"),
        aria: el.getAttribute("aria-label"),
        testId: el.getAttribute("data-testid"),
        cls: (el.className?.toString?.() || "").slice(0, 140),
        text: (el.innerText || "").trim().slice(0, 100),
      })).filter((n) => n.text || n.role || /option|choice|radio|button|tray/i.test(n.cls));

      return {
        found: true,
        pendingCount: optionLeaves.length,
        rootText: (target.innerText || "").trim().slice(0, 500),
        allCls,
        nodes,
      };
    })()`);

    const actions = await client.evaluate(EXTRACT_ACTIONS_SOURCE);
    client.close();

    if (dump.found) {
      const answerCount = (actions.actions || []).filter(
        (a: { kind: string }) => a.kind === "answer",
      ).length;
      const payload = {
        at: new Date().toISOString(),
        dump,
        extractedActionCount: actions.actions?.length ?? 0,
        answerCount,
        extractedActions: actions.actions ?? [],
      };
      fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
      console.log(
        `[ask-probe] wrote actions=${payload.extractedActionCount} answers=${answerCount} leaves=${dump.pendingCount}`,
      );
      if (answerCount > 0) {
        console.log("[ask-probe] DONE");
        process.exit(0);
      }
    }
  } catch (err) {
    console.log("[ask-probe] err", (err as Error).message);
  }
  await new Promise((r) => setTimeout(r, 1500));
}

console.log("[ask-probe] timeout — no durable pending AskQuestion UI seen");
process.exit(2);
