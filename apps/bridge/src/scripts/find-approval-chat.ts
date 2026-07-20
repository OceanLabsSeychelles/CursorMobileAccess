/**
 * Find which chat tab contains Auto-review / hello-world and dump approval UI.
 */
import { loadConfig } from "../config.js";
import { isWorkbenchTarget, listCdpTargets } from "../cdp/discover.js";
import { CdpClient } from "../cdp/client.js";
import { EXTRACT_ACTIONS_SOURCE } from "../extract/actions-source.js";

const config = loadConfig();
const targets = (await listCdpTargets(config.cdpHttpUrl)).filter(isWorkbenchTarget);
const client = new CdpClient(targets[0]!.webSocketDebuggerUrl!);
await client.connect();

const tabs = await client.evaluate(`(() => {
  const buttons = [...document.querySelectorAll(
    "div[role='button'][data-sidebar-menu-button], [data-sidebar-menu-button], [class*='sidebar'] [role='button']"
  )];
  return buttons.slice(0, 40).map((el, i) => {
    const r = el.getBoundingClientRect();
    return {
      i,
      text: (el.innerText || el.getAttribute("aria-label") || "").trim().slice(0, 80),
      top: Math.round(r.top),
      h: Math.round(r.height),
      cls: ((el.className && el.className.toString) ? el.className.toString() : "").slice(0, 100),
    };
  }).filter((t) => t.text && t.h > 8);
})()`);

console.log("TABS", JSON.stringify(tabs, null, 2));

// Try clicking tabs that look like this project / agent chat
const keywords = /cursor|mobile|access|perm|chip|docker|hello|approval|bridge/i;
for (const tab of tabs) {
  if (!keywords.test(tab.text) && !/agent|chat/i.test(tab.text)) continue;
  console.log("clicking tab", tab.text);
  await client.evaluate(`(() => {
    const buttons = [...document.querySelectorAll("div[role='button'][data-sidebar-menu-button], [data-sidebar-menu-button]")];
    const el = buttons[${tab.i}];
    if (!el) return false;
    el.click();
    return true;
  })()`);
  await new Promise((r) => setTimeout(r, 600));
  const probe = await client.evaluate(`(() => {
    const text = document.body.innerText || "";
    return {
      hasAuto: /Auto-review/i.test(text),
      hasHello: /hello-world/i.test(text),
      hasSkip: /\\bSkip\\b/.test(text) && /Always\\s+Run/.test(text),
      hasGate: !!document.querySelector("[class*='ui-tool-approval-gate'], [class*='tool-approval-gate']"),
      tail: text.slice(-500),
    };
  })()`);
  console.log("after click", JSON.stringify(probe, null, 2));
  if (probe.hasAuto || probe.hasHello || probe.hasGate || probe.hasSkip) {
    const actions = await client.evaluate(EXTRACT_ACTIONS_SOURCE);
    const deep = await client.evaluate(`(() => {
      const gates = [...document.querySelectorAll("[class*='approval'], [class*='allowlist'], button, [role=button]")].filter((el) => {
        const t = ((el.innerText || "") + " " + (el.getAttribute("aria-label") || "")).trim();
        return t.length < 40 && /^(Skip|Run|Always Run)/i.test(t);
      }).map((el) => ({
        text: (el.innerText || "").trim(),
        aria: el.getAttribute("aria-label"),
        cls: ((el.className && el.className.toString) ? el.className.toString() : "").slice(0, 160),
        tag: el.tagName,
      }));
      return gates;
    })()`);
    console.log("FOUND CHAT", JSON.stringify({ actions, deep }, null, 2));
    client.close();
    process.exit(0);
  }
}

// Also try every sidebar button briefly
console.log("scanning all tabs…");
for (const tab of tabs) {
  await client.evaluate(`(() => {
    const buttons = [...document.querySelectorAll("div[role='button'][data-sidebar-menu-button], [data-sidebar-menu-button]")];
    const el = buttons[${tab.i}];
    if (el) el.click();
  })()`);
  await new Promise((r) => setTimeout(r, 350));
  const probe = await client.evaluate(`(() => {
    const text = document.body.innerText || "";
    return {
      title: ${JSON.stringify(tab.text)},
      hasAuto: /Auto-review/i.test(text),
      hasHello: /hello-world/i.test(text),
      hasGate: !!document.querySelector("[class*='ui-tool-approval-gate'], [class*='tool-approval-gate']"),
      hasCma: /CursorMobileAccess|sendComposerMessage|probe-gate/i.test(text),
    };
  })()`);
  if (probe.hasAuto || probe.hasHello || probe.hasGate || probe.hasCma) {
    console.log("match", JSON.stringify(probe, null, 2));
    const actions = await client.evaluate(EXTRACT_ACTIONS_SOURCE);
    console.log("actions", JSON.stringify(actions, null, 2));
    if (probe.hasAuto || probe.hasGate) {
      client.close();
      process.exit(0);
    }
  }
}

console.log("no matching chat with live Auto-review");
client.close();
process.exit(2);
