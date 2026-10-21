import { loadConfig } from "../config.js";
import { isWorkbenchTarget, listCdpTargets } from "../cdp/discover.js";
import { CdpClient } from "../cdp/client.js";
import { EXTRACT_COMPOSER_UI_SOURCE } from "../extract/composer-source.js";

const config = loadConfig();
const targets = (await listCdpTargets(config.cdpHttpUrl)).filter(isWorkbenchTarget);
console.log(
  JSON.stringify(
    {
      targetCount: targets.length,
      titles: targets.map((t) => t.title),
    },
    null,
    2,
  ),
);
if (!targets[0]?.webSocketDebuggerUrl) {
  console.error("No workbench target");
  process.exit(1);
}
const client = new CdpClient(targets[0].webSocketDebuggerUrl);
await client.connect();

const dump = await client.evaluate(`(() => {
  function titleOf(el) {
    return ((el.innerText || el.getAttribute("aria-label") || el.getAttribute("title") || "")
      .trim().split("\\n")[0].trim());
  }
  var buttons = Array.prototype.slice.call(
    document.querySelectorAll("[data-sidebar-menu-button]")
  );
  var sample = buttons.slice(0, 25).map(function (el) {
    var r = el.getBoundingClientRect();
    var cls = el.className && el.className.toString ? el.className.toString() : "";
    return {
      title: titleOf(el).slice(0, 80),
      tag: el.tagName,
      role: el.getAttribute("role"),
      dataActive: el.getAttribute("data-active"),
      sectionHead: /ui-sidebar-section-head/.test(cls),
      w: Math.round(r.width),
      h: Math.round(r.height),
    };
  });
  return {
    buttonCount: buttons.length,
    sample: sample,
    titles: buttons.map(titleOf).filter(Boolean).slice(0, 60),
  };
})()`);

const extracted = await client.evaluate(EXTRACT_COMPOSER_UI_SOURCE);
client.close();

console.log(
  JSON.stringify(
    {
      dump,
      extractOk: extracted?.ok,
      extractReason: extracted?.reason,
      tabCount: extracted?.tabs?.length ?? 0,
      tabs: (extracted?.tabs || []).slice(0, 40),
      hasMoreOverflow: extracted?.hasMoreOverflow,
    },
    null,
    2,
  ),
);
