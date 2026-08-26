import { loadConfig } from "../config.js";
import { isWorkbenchTarget, listCdpTargets } from "../cdp/discover.js";
import { CdpClient } from "../cdp/client.js";
import { EXTRACT_ACTIONS_SOURCE } from "../extract/actions-source.js";

const config = loadConfig();
const targets = (await listCdpTargets(config.cdpHttpUrl)).filter(isWorkbenchTarget);
const client = new CdpClient(targets[0]!.webSocketDebuggerUrl!);
await client.connect();

await client.evaluate(`(() => {
  const tabs = [...document.querySelectorAll("button, [role='tab']")];
  for (const t of tabs) {
    const text = (t.innerText || "").trim();
    if (/cursor ide remote chat/i.test(text)) {
      t.click();
      return text;
    }
  }
  return null;
})()`);

await new Promise((r) => setTimeout(r, 800));

const probe = await client.evaluate(`(() => {
  const builds = [...document.querySelectorAll(
    ".composer-create-plan-build-button, [class*='create-plan-build'], [class*='create-plan-view-plan']"
  )];
  return builds.map((el) => ({
    text: (el.innerText || "").trim(),
    cls: (el.className?.toString?.() || "").slice(0, 120),
    visible: (() => {
      const r = el.getBoundingClientRect();
      return r.width > 8 && r.height > 8;
    })(),
    inTranscript: !!el.closest("[data-react-transcript-row-kind]"),
    rowKind: el.closest("[data-react-transcript-row-kind]")?.getAttribute("data-react-transcript-row-kind"),
    msgId: el.closest("[data-message-id]")?.getAttribute("data-message-id")?.slice(0, 12),
    ancestorDisabled: !!el.closest("[aria-disabled='true'], [data-disabled='true'], .is-disabled"),
  }));
})()`);

const actions = await client.evaluate(EXTRACT_ACTIONS_SOURCE);
console.log(JSON.stringify({ probe, actions }, null, 2));
client.close();
