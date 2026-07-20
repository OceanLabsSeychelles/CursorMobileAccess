import { loadConfig } from "../config.js";
import { isWorkbenchTarget, listCdpTargets } from "../cdp/discover.js";
import { CdpClient } from "../cdp/client.js";

const config = loadConfig();
const targets = await listCdpTargets(config.cdpHttpUrl);
console.log(
  "targets",
  targets.map((t) => ({
    title: t.title,
    type: t.type,
    url: t.url?.slice(0, 80),
    workbench: /workbench|agents/i.test(t.title || "") || /cursor/i.test(t.url || ""),
  })),
);

const wb = targets.filter(isWorkbenchTarget);
console.log("workbench count", wb.length, wb.map((t) => t.title));

for (const t of wb.slice(0, 3)) {
  const client = new CdpClient(t.webSocketDebuggerUrl!);
  await client.connect();
  const dump = await client.evaluate(`(() => {
    const a = document.querySelectorAll("button.ui-sidebar-menu-button").length;
    const b = document.querySelectorAll("[class*='ui-sidebar-menu-button']").length;
    const c = document.querySelectorAll("[data-sidebar-menu-button]").length;
    const sample = [...document.querySelectorAll("[class*='sidebar-menu']")].slice(0, 5).map((el) => ({
      tag: el.tagName,
      cls: (el.className?.toString?.() || "").slice(0, 100),
      text: (el.innerText || "").trim().slice(0, 60),
    }));
    return { title: document.title, a, b, c, sample };
  })()`);
  console.log(JSON.stringify({ target: t.title, dump }, null, 2));
  client.close();
}
