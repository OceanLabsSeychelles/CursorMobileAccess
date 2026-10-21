/**
 * Probe whether pinned chats hide behind "More..." / overflow and get missed by extract.
 */
import fs from "node:fs";
import { loadConfig } from "../config.js";
import { isWorkbenchTarget, listCdpTargets } from "../cdp/discover.js";
import { CdpClient } from "../cdp/client.js";
import { EXTRACT_COMPOSER_UI_SOURCE } from "../extract/composer-source.js";

const outPath = new URL("../../../../tmp-tabs-more-probe.json", import.meta.url);
const config = loadConfig();
const targets = (await listCdpTargets(config.cdpHttpUrl)).filter(isWorkbenchTarget);
if (!targets[0]?.webSocketDebuggerUrl) {
  console.error("No CDP target");
  process.exit(1);
}

const client = new CdpClient(targets[0].webSocketDebuggerUrl);
await client.connect();

const probe = await client.evaluate(`(() => {
  function rect(el) {
    var r = el.getBoundingClientRect();
    return {
      w: Math.round(r.width),
      h: Math.round(r.height),
      top: Math.round(r.top),
      left: Math.round(r.left),
    };
  }
  function titleOf(el) {
    return ((el.innerText || el.getAttribute("aria-label") || el.getAttribute("title") || "")
      .trim()
      .split("\\n")[0]
      .trim());
  }
  function isHidden(el) {
    var r = el.getBoundingClientRect();
    var cs = getComputedStyle(el);
    if (r.width < 2 || r.height < 2) return true;
    if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") return true;
    if (el.closest("[hidden]")) return true;
    // aria-hidden ancestors often wrap overflow menus content while closed
    var node = el;
    while (node && node !== document.body) {
      if (node.getAttribute && node.getAttribute("aria-hidden") === "true") return true;
      node = node.parentElement;
    }
    return false;
  }

  var all = Array.prototype.slice
    .call(document.querySelectorAll("[data-sidebar-menu-button]"))
    .map(function (el) {
      var title = titleOf(el);
      var cls = el.className && el.className.toString ? el.className.toString() : "";
      var r = rect(el);
      return {
        title: title.slice(0, 80),
        hidden: isHidden(el),
        dataActive: el.getAttribute("data-active"),
        ariaCurrent: el.getAttribute("aria-current"),
        cls: cls.slice(0, 140),
        w: r.w,
        h: r.h,
        top: r.top,
        left: r.left,
      };
    });

  var moreish = Array.prototype.slice
    .call(
      document.querySelectorAll(
        "button, [role='button'], [role='menuitem'], [aria-haspopup], [aria-expanded]"
      )
    )
    .filter(function (el) {
      var t = (el.innerText || el.getAttribute("aria-label") || el.getAttribute("title") || "").trim();
      var cls = el.className && el.className.toString ? el.className.toString() : "";
      return /more|overflow|show all|see all|\\+\\d+/i.test(t) || /more|overflow/i.test(cls);
    })
    .slice(0, 50)
    .map(function (el) {
      var r = rect(el);
      return {
        text: (el.innerText || "").trim().slice(0, 80),
        aria: el.getAttribute("aria-label"),
        titleAttr: el.getAttribute("title"),
        expanded: el.getAttribute("aria-expanded"),
        haspopup: el.getAttribute("aria-haspopup"),
        cls: (el.className && el.className.toString ? el.className.toString() : "").slice(0, 160),
        hidden: isHidden(el),
        w: r.w,
        h: r.h,
        top: r.top,
        left: r.left,
      };
    });

  var menus = Array.prototype.slice
    .call(
      document.querySelectorAll(
        "[role='menu'], [role='listbox'], [data-radix-menu-content], [data-radix-popper-content-wrapper], [class*='popover'], [class*='dropdown-menu']"
      )
    )
    .slice(0, 25)
    .map(function (el) {
      var r = rect(el);
      var items = Array.prototype.slice
        .call(el.querySelectorAll("[role='menuitem'], [role='option'], button, [role='button']"))
        .map(function (it) {
          return titleOf(it).slice(0, 80);
        })
        .filter(Boolean);
      return {
        role: el.getAttribute("role"),
        cls: (el.className && el.className.toString ? el.className.toString() : "").slice(0, 160),
        textPreview: (el.innerText || "").trim().slice(0, 240),
        items: items.slice(0, 40),
        itemCount: items.length,
        hidden: isHidden(el),
        w: r.w,
        h: r.h,
      };
    });

  var tray = Array.prototype.slice
    .call(
      document.querySelectorAll(
        ".chat-title-tab-row [role='tab'], .chat-title-tab-tray-root button, [class*='chat-title-tab']"
      )
    )
    .map(function (el) {
      var r = rect(el);
      return {
        text: titleOf(el).slice(0, 80),
        aria: el.getAttribute("aria-label"),
        hidden: isHidden(el),
        w: r.w,
        h: r.h,
        cls: (el.className && el.className.toString ? el.className.toString() : "").slice(0, 120),
      };
    });

  // Look for collapsed/virtualized markers near sidebar
  var markers = Array.prototype.slice
    .call(
      document.querySelectorAll(
        "[class*='more'], [data-testid*='more'], [aria-label*='More' i], [aria-label*='more' i]"
      )
    )
    .slice(0, 30)
    .map(function (el) {
      var r = rect(el);
      return {
        tag: el.tagName,
        text: (el.innerText || "").trim().slice(0, 60),
        aria: el.getAttribute("aria-label"),
        cls: (el.className && el.className.toString ? el.className.toString() : "").slice(0, 160),
        hidden: isHidden(el),
        w: r.w,
        h: r.h,
        top: r.top,
        left: r.left,
      };
    });

  return {
    sidebarTotal: all.length,
    sidebarVisibleTitles: all
      .filter(function (x) {
        return !x.hidden && x.title;
      })
      .map(function (x) {
        return x.title;
      }),
    sidebarHiddenTitles: all
      .filter(function (x) {
        return x.hidden && x.title;
      })
      .map(function (x) {
        return x.title;
      }),
    sidebarAll: all,
    moreish: moreish,
    menus: menus,
    tray: tray,
    markers: markers,
  };
})()`);

const extracted = await client.evaluate(EXTRACT_COMPOSER_UI_SOURCE);

// Try clicking a visible "More" control if present, then re-extract
let afterMore = null;
const moreCandidate = (probe?.moreish || []).find(
  (m) =>
    !m.hidden &&
    m.w > 8 &&
    m.h > 8 &&
    /more/i.test(`${m.text || ""} ${m.aria || ""} ${m.titleAttr || ""}`),
);

if (moreCandidate) {
  await client.evaluate(`(() => {
    var wantText = ${JSON.stringify(moreCandidate.text || "")};
    var wantAria = ${JSON.stringify(moreCandidate.aria || "")};
    var nodes = document.querySelectorAll("button, [role='button']");
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var t = (el.innerText || "").trim();
      var a = el.getAttribute("aria-label") || "";
      if ((wantText && t.indexOf(wantText.slice(0, 20)) === 0) || (wantAria && a === wantAria)) {
        el.click();
        return { clicked: true, text: t.slice(0, 40), aria: a };
      }
    }
    return { clicked: false };
  })()`);
  await new Promise((r) => setTimeout(r, 400));
  afterMore = await client.evaluate(`(() => {
    function titleOf(el) {
      return ((el.innerText || el.getAttribute("aria-label") || "").trim().split("\\n")[0].trim());
    }
    var menus = Array.prototype.slice
      .call(document.querySelectorAll("[role='menu'], [role='listbox'], [data-radix-menu-content], [data-radix-popper-content-wrapper]"))
      .map(function (el) {
        var items = Array.prototype.slice
          .call(el.querySelectorAll("[role='menuitem'], [role='option'], button, [role='button'], [data-sidebar-menu-button]"))
          .map(function (it) { return titleOf(it).slice(0, 80); })
          .filter(Boolean);
        return {
          cls: (el.className && el.className.toString ? el.className.toString() : "").slice(0, 120),
          items: items,
          text: (el.innerText || "").trim().slice(0, 300),
        };
      });
    var sidebar = Array.prototype.slice
      .call(document.querySelectorAll("[data-sidebar-menu-button]"))
      .map(function (el) { return titleOf(el).slice(0, 80); })
      .filter(Boolean);
    return { menus: menus, sidebarTitles: sidebar };
  })()`);
}

client.close();

const extractedTitles = (extracted?.tabs || []).map((t) => t.title);
const visible = probe?.sidebarVisibleTitles || [];
const hidden = probe?.sidebarHiddenTitles || [];
const missingFromExtract = visible.filter(
  (t) =>
    t &&
    !/^(new agent|search|automations|customize|more|pinned)$/i.test(t) &&
    !extractedTitles.some((e) => e.toLowerCase() === t.toLowerCase()),
);

const payload = {
  at: new Date().toISOString(),
  extractedCount: extractedTitles.length,
  extractedTitles,
  visibleSidebarCount: visible.length,
  visibleSidebarTitles: visible,
  hiddenSidebarTitles: hidden,
  missingVisibleButNotExtracted: missingFromExtract,
  moreish: probe?.moreish || [],
  menusBeforeClick: probe?.menus || [],
  tray: probe?.tray || [],
  markers: probe?.markers || [],
  moreCandidate,
  afterMore,
};
fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
console.log(
  JSON.stringify(
    {
      extractedCount: payload.extractedCount,
      extractedTitles: payload.extractedTitles,
      visibleSidebarTitles: payload.visibleSidebarTitles,
      hiddenSidebarTitles: payload.hiddenSidebarTitles,
      missingVisibleButNotExtracted: payload.missingVisibleButNotExtracted,
      moreishSummary: payload.moreish.map((m) => ({
        text: m.text,
        aria: m.aria,
        hidden: m.hidden,
        w: m.w,
        h: m.h,
        expanded: m.expanded,
      })),
      tray: payload.tray,
      markers: payload.markers.slice(0, 15),
      moreCandidate: payload.moreCandidate,
      afterMoreMenus: (payload.afterMore?.menus || []).map((m) => ({
        itemCount: m.items?.length,
        items: m.items,
        text: (m.text || "").slice(0, 120),
      })),
      afterMoreSidebarCount: payload.afterMore?.sidebarTitles?.length,
    },
    null,
    2,
  ),
);
