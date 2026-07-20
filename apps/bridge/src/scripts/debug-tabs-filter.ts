import { loadConfig } from "../config.js";
import { isWorkbenchTarget, listCdpTargets } from "../cdp/discover.js";
import { CdpClient } from "../cdp/client.js";

const config = loadConfig();
const targets = (await listCdpTargets(config.cdpHttpUrl)).filter(isWorkbenchTarget);
const client = new CdpClient(targets[0]!.webSocketDebuggerUrl!);
await client.connect();

const dump = await client.evaluate(`(() => {
  function chatTitleFromText(text) {
    return (text || "").trim().split("\\n")[0].trim();
  }
  function isAgentChatButton(el) {
    if (!el || el.tagName !== "BUTTON") return false;
    var cls = el.className && el.className.toString ? el.className.toString() : "";
    if (!/ui-sidebar-menu-button/.test(cls)) return false;
    if (/ui-sidebar-section-head/.test(cls)) return false;
    if (el.getAttribute("data-action-id")) return false;
    var title = chatTitleFromText(el.innerText || el.getAttribute("aria-label") || "");
    if (!title) return false;
    if (/^(new agent|search|automations|customize|more|pinned)$/i.test(title)) return false;
    if (/pro plan/i.test(el.innerText || "")) return false;
    return true;
  }
  var all = Array.prototype.slice.call(
    document.querySelectorAll("button.ui-sidebar-menu-button, button[data-sidebar-menu-button]")
  );
  var accepted = [];
  var rejected = [];
  for (var i = 0; i < all.length; i++) {
    var el = all[i];
    var title = chatTitleFromText(el.innerText || "");
    var cls = el.className && el.className.toString ? el.className.toString() : "";
    var info = {
      title: title,
      tag: el.tagName,
      actionId: el.getAttribute("data-action-id"),
      dataActive: el.getAttribute("data-active"),
      sectionHead: /ui-sidebar-section-head/.test(cls),
      hasMenuBtn: /ui-sidebar-menu-button/.test(cls),
    };
    if (isAgentChatButton(el)) accepted.push(info);
    else rejected.push(info);
  }
  return { allCount: all.length, accepted: accepted.slice(0, 20), rejected: rejected.slice(0, 15) };
})()`);

console.log(JSON.stringify(dump, null, 2));
client.close();
