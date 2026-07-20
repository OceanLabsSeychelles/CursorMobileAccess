/**
 * Sample message nodes for extractor tuning.
 */
import { loadConfig } from "../config.js";
import { isWorkbenchTarget, listCdpTargets } from "../cdp/discover.js";
import { CdpClient } from "../cdp/client.js";

const config = loadConfig();
const targets = (await listCdpTargets(config.cdpHttpUrl)).filter(isWorkbenchTarget);
const client = new CdpClient(targets[0]!.webSocketDebuggerUrl!);
await client.connect();

const sample = await client.evaluate(`(() => {
  const msgs = [...document.querySelectorAll("[data-message-role]")].map((el) => ({
    role: el.getAttribute("data-message-role"),
    kind: el.getAttribute("data-message-kind"),
    id: el.getAttribute("data-message-id"),
    index: el.getAttribute("data-message-index"),
    className: (el.className?.toString?.() || "").slice(0, 120),
    text: (el.innerText || "").trim().slice(0, 180),
    hasMarkdown: !!el.querySelector(".markdown-root, [class*=markdown-root]"),
    hasReadonly: !!el.querySelector(".aislash-editor-input-readonly, [class*=aislash-editor-input-readonly]"),
  }));

  const transcriptRows = [...document.querySelectorAll("[data-react-transcript-row-kind]")].slice(0, 20).map((el) => ({
    kind: el.getAttribute("data-react-transcript-row-kind"),
    key: el.getAttribute("data-react-transcript-row-key"),
    text: (el.innerText || "").trim().slice(0, 120),
  }));

  const status = [...document.querySelectorAll("[data-composer-status]")].map((el) => ({
    status: el.getAttribute("data-composer-status"),
    location: el.getAttribute("data-composer-location"),
    id: el.getAttribute("data-composer-id"),
  }));

  const sidebar = [...document.querySelectorAll(".ui-sidebar-menu-button, [class*=sidebar-menu-button]")].slice(0, 15).map((el) => ({
    text: (el.innerText || "").trim().slice(0, 80),
    aria: el.getAttribute("aria-label"),
    active: el.getAttribute("data-active") || el.getAttribute("aria-current"),
  }));

  return { msgs, transcriptRows, status, sidebar };
})()`);

console.log(JSON.stringify(sample, null, 2));
client.close();
