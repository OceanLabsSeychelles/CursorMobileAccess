import type { CdpClient } from "../cdp/client.js";

export type ExpandMoreResult = {
  clicked: boolean;
  reason?: string;
};

/**
 * Click the Agents sidebar "More" control once if present.
 * Does not collapse anything — leave the list expanded for the user in Cursor.
 */
export async function expandAgentsMore(
  client: CdpClient,
): Promise<ExpandMoreResult> {
  const result = await client.evaluate<{
    clicked: boolean;
    reason?: string;
  }>(`(() => {
    function titleOf(el) {
      return ((el.innerText || el.getAttribute("aria-label") || el.getAttribute("title") || "")
        .trim()
        .split("\\n")[0]
        .trim());
    }
    function visible(el) {
      var r = el.getBoundingClientRect();
      return r.width > 8 && r.height > 8;
    }
    var nodes = document.querySelectorAll("[data-sidebar-menu-button]");
    var more = null;
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var t = titleOf(el);
      if (!/^more$/i.test(t)) continue;
      if (!visible(el)) continue;
      more = el;
      break;
    }
    if (!more) return { clicked: false, reason: "no-more" };
    more.scrollIntoView({ block: "center", inline: "nearest" });
    if (typeof more.click === "function") more.click();
    else {
      more.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    }
    return { clicked: true };
  })()`);

  return result ?? { clicked: false, reason: "evaluate-failed" };
}
