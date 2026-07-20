import type { CdpClient } from "../cdp/client.js";
import type { CommandResult } from "./send-message.js";

/**
 * Type into the questionnaire "Other…" freeform field in the prompt-header tray.
 */
export async function fillQuestionnaireFreeform(
  client: CdpClient,
  text: string,
): Promise<CommandResult> {
  const trimmed = text.trim();
  if (!trimmed) {
    return { ok: false, error: "Empty freeform text" };
  }

  await client.bringToFront();

  const result = await client.evaluate<{
    ok: boolean;
    error?: string;
  }>(
    `(() => {
      var text = ${JSON.stringify(trimmed)};
      function visible(el) {
        var r = el.getBoundingClientRect();
        return r.width > 8 && r.height > 8 && r.bottom > 0 && r.top < (window.innerHeight || 800);
      }
      function fireClick(el) {
        el.scrollIntoView({ block: "center", inline: "nearest" });
        var r = el.getBoundingClientRect();
        var x = r.left + Math.min(r.width / 2, 24);
        var y = r.top + Math.min(r.height / 2, 16);
        var opts = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, button: 0 };
        el.dispatchEvent(new MouseEvent("mousedown", opts));
        el.dispatchEvent(new MouseEvent("mouseup", opts));
        el.dispatchEvent(new MouseEvent("click", opts));
        if (typeof el.click === "function") el.click();
      }
      function findFreeformOption() {
        var nodes = document.querySelectorAll(
          "button.questionnaire-freeform-option, [class*='questionnaire-freeform-option'], button.ui-tray-option"
        );
        for (var i = 0; i < nodes.length; i++) {
          var n = nodes[i];
          if (!visible(n)) continue;
          var cls = n.className && n.className.toString ? n.className.toString() : "";
          var label = (n.innerText || "").trim();
          if (/freeform/i.test(cls) || /^d\\.?\\s*other/i.test(label) || /\\bother\\.?\\.\\.\\./i.test(label)) {
            return n;
          }
        }
        return null;
      }
      function findInput(root) {
        var scope = root || document;
        var candidates = scope.querySelectorAll(
          "textarea, input[type='text'], input:not([type]), [contenteditable='true'], .tiptap, [class*='freeform'] textarea, [class*='freeform'] input, [class*='freeform'] [contenteditable='true']"
        );
        for (var i = 0; i < candidates.length; i++) {
          var el = candidates[i];
          if (!visible(el)) continue;
          if (el.closest(".composer-bar") && !el.closest("[class*='tray'], [class*='questionnaire']")) continue;
          if (el.closest("[data-prompt-input-tiptap-readonly], .composer-human-message")) continue;
          return el;
        }
        // Prefer inputs inside tray/questionnaire even if small
        var tray = document.querySelector(
          ".ui-tray, [class*='glass-questionnaire-tray'], .ui-prompt-input-header-tray, [class*='questionnaire']"
        );
        if (tray) {
          var nested = tray.querySelectorAll("textarea, input, [contenteditable='true']");
          for (var j = 0; j < nested.length; j++) {
            if (visible(nested[j])) return nested[j];
          }
        }
        return null;
      }

      var opt = findFreeformOption();
      if (opt) fireClick(opt);

      var input = findInput(opt) || findInput(null);
      // If still missing, option click may need a frame to expand
      if (!input && opt) {
        // try again searching from document
        input = findInput(document);
      }
      if (!input) {
        return { ok: false, error: "Freeform text field not found — select Other first" };
      }

      fireClick(input);
      input.focus();

      if (input.tagName === "TEXTAREA" || input.tagName === "INPUT") {
        var setter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          "value"
        ) || Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value");
        if (setter && setter.set) setter.set.call(input, text);
        else input.value = text;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      } else {
        // contenteditable / tiptap
        try {
          document.execCommand("selectAll", false, undefined);
          document.execCommand("insertText", false, text);
        } catch (e) {
          input.textContent = text;
          input.dispatchEvent(new InputEvent("input", { bubbles: true, data: text, inputType: "insertText" }));
        }
      }
      return { ok: true };
    })()`,
  );

  return result?.ok
    ? { ok: true }
    : { ok: false, error: result?.error ?? "Freeform fill failed" };
}
