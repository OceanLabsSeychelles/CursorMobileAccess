import type { CdpClient } from "../cdp/client.js";
import type { CommandResult } from "./send-message.js";

/**
 * Click an Agents sidebar chat by its display title (first line).
 */
export async function selectAgentChat(
  client: CdpClient,
  title: string,
): Promise<CommandResult> {
  const trimmed = title.trim();
  if (!trimmed) {
    return {
      ok: false,
      error: "Chat title missing — reopen the Agents sidebar in Cursor",
    };
  }

  await client.bringToFront();

  const result = await client.evaluate<{ ok: boolean; error?: string }>(
    `(() => {
      var want = ${JSON.stringify(trimmed)}.toLowerCase();
      function visible(el) {
        var r = el.getBoundingClientRect();
        return r.width > 8 && r.height > 8 && r.bottom > 0 && r.top < (window.innerHeight || 800);
      }
      function fireClick(el) {
        el.scrollIntoView({ block: "center", inline: "nearest" });
        var r = el.getBoundingClientRect();
        var x = r.left + Math.min(r.width / 2, 40);
        var y = r.top + Math.min(r.height / 2, 16);
        var opts = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, button: 0 };
        try { el.dispatchEvent(new PointerEvent("pointerdown", Object.assign({ pointerId: 1, pointerType: "mouse" }, opts))); } catch (e) {}
        el.dispatchEvent(new MouseEvent("mousedown", opts));
        try { el.dispatchEvent(new PointerEvent("pointerup", Object.assign({ pointerId: 1, pointerType: "mouse" }, opts))); } catch (e) {}
        el.dispatchEvent(new MouseEvent("mouseup", opts));
        el.dispatchEvent(new MouseEvent("click", opts));
        if (typeof el.click === "function") el.click();
      }
      function chatTitle(el) {
        return ((el && (el.innerText || el.getAttribute("aria-label") || el.getAttribute("title"))) || "")
          .trim()
          .split("\\n")[0]
          .trim();
      }
      function isAgentChat(el) {
        if (!el) return false;
        var isBtn =
          el.tagName === "BUTTON" || el.getAttribute("role") === "button";
        if (!isBtn) return false;
        if (el.getAttribute("data-sidebar-menu-button") == null) return false;
        var cls = el.className && el.className.toString ? el.className.toString() : "";
        if (/ui-sidebar-section-head/.test(cls)) return false;
        if (el.getAttribute("data-action-id")) return false;
        var title = chatTitle(el);
        if (!title) return false;
        if (/^(new agent|search|automations|customize|more|pinned)$/i.test(title)) return false;
        if (/pro plan/i.test(el.innerText || el.getAttribute("aria-label") || "")) return false;
        return true;
      }

      var nodes = document.querySelectorAll("[data-sidebar-menu-button]");
      var match = null;
      for (var i = 0; i < nodes.length; i++) {
        var el = nodes[i];
        if (!isAgentChat(el)) continue;
        var t = chatTitle(el);
        if (t.toLowerCase() === want) {
          match = el;
          break;
        }
      }
      if (!match) {
        // Prefix match fallback (truncation on phone)
        for (var j = 0; j < nodes.length; j++) {
          var el2 = nodes[j];
          if (!isAgentChat(el2)) continue;
          var t2 = chatTitle(el2);
          if (t2.toLowerCase().indexOf(want) === 0 || want.indexOf(t2.toLowerCase()) === 0) {
            match = el2;
            break;
          }
        }
      }
      if (!match) {
        // Try showing the Agents sidebar if it was collapsed
        var show = document.querySelector(
          "[aria-label='Show Sidebar'], [aria-label='Show Agents'], [aria-label*='Agents' i][aria-label*='Show' i]"
        );
        if (show && typeof show.click === "function") {
          try { show.click(); } catch (e) {}
        }
        return { ok: false, error: "Chat not found in Agents sidebar: " + want };
      }
      if (!visible(match)) match.scrollIntoView({ block: "center" });
      fireClick(match);
      return { ok: true };
    })()`,
  );

  return result?.ok
    ? { ok: true }
    : { ok: false, error: result?.error ?? "select_tab failed" };
}
