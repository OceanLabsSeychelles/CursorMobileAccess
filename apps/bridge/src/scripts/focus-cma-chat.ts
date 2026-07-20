/**
 * Focus "Cursor IDE remote chat" and dump approval / actions.
 */
import { loadConfig } from "../config.js";
import { isWorkbenchTarget, listCdpTargets } from "../cdp/discover.js";
import { CdpClient } from "../cdp/client.js";
import { EXTRACT_ACTIONS_SOURCE } from "../extract/actions-source.js";

const config = loadConfig();
const targets = (await listCdpTargets(config.cdpHttpUrl)).filter(isWorkbenchTarget);
const client = new CdpClient(targets[0]!.webSocketDebuggerUrl!);
await client.connect();

const clicked = await client.evaluate(`(() => {
  const buttons = [...document.querySelectorAll("[data-sidebar-menu-button], .ui-sidebar-menu-button")];
  const el = buttons.find((b) => /Cursor IDE remote chat/i.test(b.innerText || ""));
  if (!el) return { ok: false };
  el.scrollIntoView({ block: "center" });
  el.click();
  return { ok: true, text: (el.innerText || "").trim().slice(0, 80) };
})()`);
console.log("clicked", clicked);
await new Promise((r) => setTimeout(r, 900));

const probe = await client.evaluate(`(() => {
  const text = document.body.innerText || "";
  const gates = [...document.querySelectorAll("button, [role='button']")].filter((el) => {
    const t = ((el.innerText || "") + " " + (el.getAttribute("aria-label") || ""))
      .trim()
      .replace(/\\s+/g, " ");
    return t.length > 0 && t.length < 50 && /^(Skip|Run|Always Run)/i.test(t);
  }).map((el) => ({
    text: (el.innerText || "").trim().slice(0, 50),
    aria: el.getAttribute("aria-label"),
    cls: ((el.className && el.className.toString) ? el.className.toString() : "").slice(0, 160),
    tag: el.tagName,
  }));

  const rows = [...document.querySelectorAll("[data-react-transcript-row-kind], [data-message-kind]")]
    .filter((el) => /hello-world|Auto-review|Always Run/i.test(el.innerText || ""))
    .slice(0, 6)
    .map((el) => ({
      kind:
        el.getAttribute("data-react-transcript-row-kind") ||
        el.getAttribute("data-message-kind"),
      text: (el.innerText || "").trim().slice(0, 350),
      html: el.innerHTML.slice(0, 700),
    }));

  return {
    hasAuto: /Auto-review/i.test(text),
    hasHello: /hello-world/i.test(text),
    hasSkipPair: /\\bSkip\\b/.test(text) && /Always\\s+Run/.test(text),
    hasGate: !!document.querySelector("[class*='ui-tool-approval-gate'], [class*='tool-approval-gate']"),
    gates,
    rows,
  };
})()`);

const actions = await client.evaluate(EXTRACT_ACTIONS_SOURCE);
console.log(JSON.stringify({ probe, actions }, null, 2));
client.close();
