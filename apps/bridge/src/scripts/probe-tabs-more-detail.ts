import { loadConfig } from "../config.js";
import { isWorkbenchTarget, listCdpTargets } from "../cdp/discover.js";
import { CdpClient } from "../cdp/client.js";
import { EXTRACT_COMPOSER_UI_SOURCE } from "../extract/composer-source.js";

const config = loadConfig();
const targets = (await listCdpTargets(config.cdpHttpUrl)).filter(isWorkbenchTarget);
const client = new CdpClient(targets[0].webSocketDebuggerUrl);
await client.connect();

const before = await client.evaluate(EXTRACT_COMPOSER_UI_SOURCE);
const beforeTitles = (before?.tabs || []).map((t) => t.title);

const detail = await client.evaluate(`(() => {
  function titleOf(el) {
    return ((el.innerText || el.getAttribute("aria-label") || el.getAttribute("title") || "")
      .trim().split("\\n")[0].trim());
  }
  function classify(el) {
    var title = titleOf(el);
    var cls = el.className && el.className.toString ? el.className.toString() : "";
    var isBtn = el.tagName === "BUTTON" || el.getAttribute("role") === "button";
    var hasSidebar = el.getAttribute("data-sidebar-menu-button") != null;
    var sectionHead = /ui-sidebar-section-head/.test(cls);
    var actionId = el.getAttribute("data-action-id");
    var chrome = /^(new agent|search|automations|customize|more|pinned)$/i.test(title);
    var reasons = [];
    if (!isBtn) reasons.push("not-button");
    if (!hasSidebar) reasons.push("no-data-sidebar-menu-button");
    if (sectionHead) reasons.push("section-head");
    if (actionId) reasons.push("has-action-id");
    if (!title) reasons.push("empty-title");
    if (chrome) reasons.push("chrome-title");
    return {
      title: title.slice(0, 80),
      tag: el.tagName,
      role: el.getAttribute("role"),
      hasSidebar: hasSidebar,
      reasonsFail: reasons,
      wouldExtract: reasons.length === 0,
      cls: cls.slice(0, 160),
    };
  }

  var interesting = [
    "Antenna3DP", "Canvas", "CadForge", "More", "New Project",
    "Android game development takeover", "Home", "EvoTime", "PixRay",
    "Network Mapper", "Lightyears-of-Fervent-Warfare"
  ];
  var all = Array.prototype.slice.call(
    document.querySelectorAll("[data-sidebar-menu-button], button, [role='button']")
  );
  var hits = [];
  for (var i = 0; i < all.length; i++) {
    var t = titleOf(all[i]);
    for (var j = 0; j < interesting.length; j++) {
      if (t === interesting[j] || t.indexOf(interesting[j]) === 0) {
        hits.push(classify(all[i]));
        break;
      }
    }
  }

  var more = null;
  var nodes = document.querySelectorAll("[data-sidebar-menu-button]");
  for (var k = 0; k < nodes.length; k++) {
    if (titleOf(nodes[k]) === "More") { more = nodes[k]; break; }
  }
  var aroundMore = null;
  if (more) {
    var root = more.parentElement && more.parentElement.parentElement
      ? more.parentElement.parentElement
      : more.parentElement;
    aroundMore = {
      titlesInSameParent: root
        ? Array.prototype.slice.call(root.querySelectorAll("[data-sidebar-menu-button]"))
            .map(titleOf).filter(Boolean)
        : [],
      nextSiblingTitles: [],
    };
    var p = more.parentElement;
    var n = p ? p.nextElementSibling : null;
    var guard = 0;
    while (n && guard++ < 30) {
      var btns = n.querySelectorAll ? n.querySelectorAll("[data-sidebar-menu-button]") : [];
      if (btns.length) {
        for (var b = 0; b < btns.length; b++) aroundMore.nextSiblingTitles.push(titleOf(btns[b]));
      } else if (n.getAttribute && n.getAttribute("data-sidebar-menu-button") != null) {
        aroundMore.nextSiblingTitles.push(titleOf(n));
      }
      n = n.nextElementSibling;
    }
  }

  return { hits: hits, aroundMore: aroundMore };
})()`);

// Click More and compare extract
const clickResult = await client.evaluate(`(() => {
  function titleOf(el) {
    return ((el.innerText || el.getAttribute("aria-label") || "").trim().split("\\n")[0].trim());
  }
  var nodes = document.querySelectorAll("[data-sidebar-menu-button]");
  for (var i = 0; i < nodes.length; i++) {
    if (titleOf(nodes[i]) === "More") {
      nodes[i].click();
      return { clicked: true };
    }
  }
  return { clicked: false };
})()`);

await new Promise((r) => setTimeout(r, 500));
const after = await client.evaluate(EXTRACT_COMPOSER_UI_SOURCE);
const afterTitles = (after?.tabs || []).map((t) => t.title);

const newlyAppeared = afterTitles.filter(
  (t) => !beforeTitles.some((b) => b.toLowerCase() === t.toLowerCase()),
);
const disappeared = beforeTitles.filter(
  (t) => !afterTitles.some((a) => a.toLowerCase() === t.toLowerCase()),
);

console.log(JSON.stringify({
  beforeCount: beforeTitles.length,
  afterCount: afterTitles.length,
  newlyAppeared,
  disappeared,
  clickResult,
  detail,
}, null, 2));

client.close();
