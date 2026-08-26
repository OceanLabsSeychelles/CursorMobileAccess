/** In-page action extractor. Plain JS — evaluated via CDP. */
export const EXTRACT_ACTIONS_SOURCE = `(() => {
  function visible(el) {
    if (!el) return false;
    var r = el.getBoundingClientRect();
    return r.width > 8 && r.height > 8 && r.bottom > 0 && r.top < (window.innerHeight || 800);
  }

  /** Sized in layout — keep even if scrolled out (pending Run/Skip often sits below the fold). */
  function inDom(el) {
    if (!el) return false;
    var r = el.getBoundingClientRect();
    return r.width > 4 && r.height > 4;
  }

  function normalizeActionLabel(text) {
    return String(text || "")
      .replace(/[\\u2318\\u21E7\\u23CE\\u21B5\\u232B\\u238B\\u21EA]/g, " ")
      .replace(/\\b(ctrl|alt|shift|cmd|command|enter|return|backspace)\\b/gi, " ")
      .replace(/\\s+/g, " ")
      .trim();
  }

  function cssPath(el) {
    if (!el || el.nodeType !== 1) return "";
    function esc(s) {
      if (window.CSS && CSS.escape) return CSS.escape(s);
      return String(s).replace(/[^a-zA-Z0-9_-]/g, "\\\\$&");
    }
    if (el.id) return "#" + esc(el.id);
    var parts = [];
    var cur = el;
    var depth = 0;
    while (cur && cur.nodeType === 1 && depth < 6) {
      var part = cur.tagName.toLowerCase();
      var cls = "";
      if (cur.classList && cur.classList.length) {
        for (var i = 0; i < cur.classList.length && i < 3; i++) {
          var c = cur.classList[i];
          if (/^(composer-|ui-|anysphere)/.test(c) || c.indexOf("run") >= 0 || c.indexOf("skip") >= 0) {
            cls += "." + esc(c);
          }
        }
      }
      part += cls;
      var parent = cur.parentElement;
      if (parent) {
        var siblings = parent.children;
        var same = 0;
        var idx = 0;
        for (var s = 0; s < siblings.length; s++) {
          if (siblings[s].tagName === cur.tagName) {
            if (siblings[s] === cur) idx = same;
            same++;
          }
        }
        if (same > 1) part += ":nth-of-type(" + (idx + 1) + ")";
      }
      parts.unshift(part);
      if (cur.getAttribute("data-message-id") || cur.classList && cur.classList.contains("composer-bar")) break;
      cur = parent;
      depth++;
    }
    return parts.join(" > ");
  }

  function classify(text, aria, cls) {
    var rawLabel = normalizeActionLabel(text) || normalizeActionLabel(aria) || "";
    var t = rawLabel;
    var lower = t.toLowerCase();
    var combined = normalizeActionLabel((text || "") + " " + (aria || ""));
    if (/\\baccept all\\b/i.test(combined)) return { kind: "approve", label: "Accept All" };
    if (/\\baccept\\b/i.test(combined) || /\\bapprove\\b/i.test(combined))
      return { kind: "approve", label: rawLabel || "Accept" };
    if (/\\breject\\b/i.test(combined) || /\\bdeny\\b/i.test(combined))
      return { kind: "reject", label: rawLabel || "Reject" };

    // Always Run MUST be before generic Run (label often includes keybinding glyphs)
    if (
      /^always\\s+run\\b/i.test(t) ||
      (/composer-run-button/i.test(cls) && /always/i.test(combined))
    ) {
      return { kind: "allow", label: rawLabel.length > 48 ? "Always Run" : rawLabel || "Always Run" };
    }
    if (
      /composer-skip-button/i.test(cls) ||
      /^skip\\b/i.test(t) ||
      /^skip\\b/i.test(normalizeActionLabel(aria))
    ) {
      return { kind: "skip", label: "Skip" };
    }
    if (
      /composer-run-button/i.test(cls) ||
      /^run\\b/i.test(t) ||
      /^run\\b/i.test(normalizeActionLabel(aria))
    ) {
      return { kind: "run", label: "Run" };
    }
    if (/^allow\\b/i.test(t) || /^allow\\b/i.test(normalizeActionLabel(aria)))
      return { kind: "allow", label: rawLabel || "Allow" };
    if (/^build\\b/i.test(t)) return { kind: "build", label: "Build" };
    if (/view plan/i.test(combined)) return { kind: "view_plan", label: "View Plan" };
    if (lower === "continue") return { kind: "allow", label: "Continue" };
    return null;
  }

  function isPermissionChrome(el) {
    if (!el || !el.closest) return false;
    return !!(
      el.closest(
        ".composer-tool-call-control-row, .composer-tool-call-allowlist-button-wrapper, " +
          "[class*='composer-tool-call-allowlist'], [class*='ui-tool-approval-gate'], [class*='tool-approval-gate'], " +
          ".ui-shell-tool-call, [class*='ui-shell-tool-call'], .ui-tool-call-card, [class*='ui-tool-call-card'], " +
          "[class*='ui-shell-tool-call__allowlist-button-wrapper']"
      ) ||
      /composer-(run|skip)-button|tool-approval-gate|shell-tool-call|tool-call-card/i.test(
        el.className && el.className.toString ? el.className.toString() : ""
      )
    );
  }

  /** Plan Build/View Plan buttons linger in transcript DOM after the step completes. */
  function isPendingPlanAction(el) {
    if (isPermissionChrome(el)) return true;
    if (
      el.closest(
        ".glass-questionnaire-tray, [class*='glass-questionnaire-tray'], .ui-prompt-input-header-tray"
      )
    ) {
      return visible(el);
    }
    var row = el.closest("[data-react-transcript-row-kind]");
    if (!row) return visible(el);
    var rowKind = row.getAttribute("data-react-transcript-row-kind") || "";
    if (
      rowKind !== "toolPlaceholder" &&
      rowKind !== "activityGroup" &&
      rowKind !== "activity"
    ) {
      return false;
    }
    var plane =
      document.querySelector(
        ".virtualized-composer-messages-virtual-plane, .composer-messages-container, .agent-panel-conversation-shell"
      ) || document.body;
    var rows = plane.querySelectorAll("[data-react-transcript-row-kind]");
    if (!rows.length) return false;
    var last = rows[rows.length - 1];
    var prev = rows.length > 1 ? rows[rows.length - 2] : null;
    if (row === last) return true;
    // tailStatus often follows the pending tool row
    if (
      prev &&
      row === prev &&
      last &&
      last.getAttribute("data-react-transcript-row-kind") === "tailStatus"
    ) {
      return true;
    }
    return false;
  }

  var actions = [];
  var seen = Object.create(null);

  function isSelected(el) {
    if (!el) return false;
    if (
      el.getAttribute("aria-pressed") === "true" ||
      el.getAttribute("aria-selected") === "true" ||
      el.getAttribute("aria-checked") === "true" ||
      el.getAttribute("data-state") === "on" ||
      el.getAttribute("data-selected") === "true" ||
      el.getAttribute("data-checked") === "true"
    ) {
      return true;
    }
    var cls = el.className && el.className.toString ? el.className.toString() : "";
    // Do NOT match bare "active" — Cursor uses that widely and it falsely selects options
    return /(?:^|\\s)(?:is-selected|is-checked|option--selected|tray-option--selected)(?:\\s|$)/i.test(
      cls,
    );
  }

  function push(kind, label, el, optionId) {
    var path = cssPath(el);
    var key = kind + "|" + label + "|" + path;
    if (seen[key]) return;
    seen[key] = true;
    actions.push({
      kind: kind,
      label: String(label).slice(0, 80),
      optionId: optionId || undefined,
      selected: kind === "answer" ? isSelected(el) : undefined,
      locator: path
        ? { by: "css", selector: path }
        : { by: "buttonText", text: label, index: 0 },
    });
  }

  // Shell Auto-review uses .ui-shell-tool-call / .ui-tool-call-card (plain ui-button),
  // not only composer-run-button / ui-tool-approval-gate.
  var preferential = document.querySelectorAll(
    ".composer-run-button, .composer-skip-button, [class*='composer-run-button'], [class*='composer-skip-button'], " +
      ".composer-create-plan-build-button, .composer-create-plan-view-plan-button, " +
      ".composer-tool-call-control-row button, .composer-tool-call-control-row [role='button'], " +
      ".composer-tool-call-allowlist-button-wrapper button, .composer-tool-call-allowlist-button-wrapper [role='button'], " +
      "[class*='ui-tool-approval-gate'] button, [class*='ui-tool-approval-gate'] [role='button'], " +
      "[class*='tool-approval-gate'] button, [class*='tool-approval-gate'] [role='button'], " +
      ".ui-tool-approval-gate__actions button, .ui-tool-approval-gate__actions [role='button'], " +
      ".ui-shell-tool-call button, [class*='ui-shell-tool-call'] button, " +
      ".ui-tool-call-card button, [class*='ui-tool-call-card'] button, " +
      "[class*='ui-shell-tool-call__allowlist-button-wrapper'] button"
  );
  for (var p = 0; p < preferential.length; p++) {
    var bel = preferential[p];
    // Permission controls: allow off-screen (still clickable via CDP)
    if (!inDom(bel)) continue;
    var btext = (bel.innerText || "").trim();
    var baria = bel.getAttribute("aria-label");
    var bcls = bel.className && bel.className.toString ? bel.className.toString() : "";
    var c = classify(btext, baria, bcls);
    if (c) {
      if (
        (c.kind === "build" || c.kind === "view_plan") &&
        !isPendingPlanAction(bel)
      ) {
        continue;
      }
      push(c.kind, c.label, bel);
    }
  }

  var buttons = document.querySelectorAll("button, [role='button']");
  for (var i = 0; i < buttons.length; i++) {
    var el = buttons[i];
    // Only skip the prompt composer chrome — NOT the whole Agents panel.
    // (.composer-bar wraps conversation + tool approvals; skipping it hid Run/Skip.)
    if (
      el.closest(
        ".ui-prompt-input, .composer-bar-input-buttons, .ui-prompt-input-submit-button"
      )
    ) {
      continue;
    }
    var text = (el.innerText || "").trim().replace(/\\s+/g, " ");
    var aria = el.getAttribute("aria-label");
    var cls = el.className && el.className.toString ? el.className.toString() : "";
    if (!text && !aria) continue;
    var norm = normalizeActionLabel(text || aria);
    var hit = classify(text, aria, cls);
    if (!hit) continue;
    if (
      (hit.kind === "build" || hit.kind === "view_plan") &&
      !isPendingPlanAction(el)
    ) {
      continue;
    }
    var shellAction =
      hit.kind === "run" ||
      hit.kind === "skip" ||
      hit.kind === "allow" ||
      isPermissionChrome(el);
    // Shell approvals are often below the fold — still extract them.
    if (shellAction ? !inDom(el) : !visible(el)) continue;
    if (!shellAction && text.length > 64 && !/^always\\s+run/i.test(norm)) continue;
    push(hit.kind, hit.label, el);
  }

  // AskQuestion pending options: prompt-header tray (ui-tray-option) OR questionnaire toolbar
  function isOptionChrome(cls) {
    return /tray-option__(badge|label|letter)|toolbar-option-(label|letter|freeform)/i.test(
      cls || "",
    );
  }

  function optionClickTarget(el) {
    var cur = el;
    for (var up = 0; up < 6 && cur; up++) {
      var c = cur.className && cur.className.toString ? cur.className.toString() : "";
      if (
        cur.matches &&
        (cur.matches("button, [role='button'], [role='option'], [role='radio'], a") ||
          cur.getAttribute("tabindex") != null)
      ) {
        return cur;
      }
      // BEM block for tray option (not __badge / __label leaves)
      if (
        /ui-tray-option(?!__)/.test(c) ||
        /composer-questionnaire-toolbar-option(?!-)/.test(c)
      ) {
        return cur;
      }
      cur = cur.parentElement;
    }
    return el;
  }

  var optionLeaves = document.querySelectorAll(
    "[class*='ui-tray-option__label'], [class*='ui-tray-option__badge'], " +
      ".composer-questionnaire-toolbar-option, [class*='composer-questionnaire-toolbar-option'], " +
      "[class*='ui-tray-option']"
  );
  var seenOptionEls = [];
  for (var to = 0; to < optionLeaves.length; to++) {
    var leaf = optionLeaves[to];
    var leafCls =
      leaf.className && leaf.className.toString ? leaf.className.toString() : "";
    // Prefer label/badge leaves; also accept block-level tray-option nodes
    if (
      !/tray-option__label|tray-option__badge|questionnaire-toolbar-option/i.test(leafCls) &&
      !(/ui-tray-option/i.test(leafCls) && !isOptionChrome(leafCls))
    ) {
      continue;
    }
    var tEl = optionClickTarget(leaf);
    if (seenOptionEls.indexOf(tEl) >= 0) continue;
    seenOptionEls.push(tEl);
    var tr = tEl.getBoundingClientRect();
    if (tr.width < 8 || tr.height < 8) continue;
    var tCls =
      tEl.className && tEl.className.toString ? tEl.className.toString() : "";
    if (/option-freeform/i.test(tCls) && !(tEl.innerText || "").trim()) continue;

    var labelEl =
      tEl.querySelector(
        "[class*='ui-tray-option__label'], .composer-questionnaire-toolbar-option-label, [class*='toolbar-option-label']",
      ) ||
      ( /tray-option__label/i.test(leafCls) ? leaf : null );
    var letterEl = tEl.querySelector(
      "[class*='ui-tray-option__badge'], .composer-questionnaire-toolbar-option-letter, [class*='toolbar-option-letter']",
    );
    var letter = letterEl && letterEl.innerText ? letterEl.innerText.trim() : "";
    var fromLabel = labelEl && labelEl.innerText ? labelEl.innerText.trim() : "";
    var tLabel = "";
    if (!fromLabel) {
      tLabel = (tEl.getAttribute("aria-label") || tEl.innerText || "")
        .trim()
        .replace(/\\s+/g, " ");
      // Only strip badge when followed by a separator, not when it starts the word
      if (letter && tLabel.indexOf(letter) === 0) {
        var rest = tLabel.slice(letter.length);
        if (!rest || /^[.\\s)\\-]/.test(rest)) {
          tLabel = rest.replace(/^[.\\s)\\-]+/, "").trim();
        }
      }
    } else {
      tLabel = fromLabel.replace(/\\s+/g, " ");
    }
    // Freeform Other… often expands into an input and loses its label text
    var isFreeform =
      /(?:^|\\s)questionnaire-freeform-option(?:\\s|$)/i.test(tCls) ||
      /(?:^|\\s)questionnaire-freeform-option(?:\\s|$)/i.test(leafCls) ||
      /^others?(?:\\s*\\.\\.\\.|\\s*…)?$/i.test(tLabel);
    if (isFreeform && !tLabel) tLabel = "Other...";
    if (!tLabel || tLabel.length > 160) continue;
    // Skip tray chrome (Skip/Submit) — those are separate actions
    if (/^(skip|submit|cancel|continue|done|send)$/i.test(tLabel)) continue;
    var answerLabel = letter ? letter + ". " + tLabel : tLabel;
    // Prefer sturdy locators: letter + ui-tray-option beats fragile css paths
    var path = cssPath(tEl);
    var key = "answer|" + answerLabel + "|" + (letter || path);
    if (!seen[key]) {
      seen[key] = true;
      actions.push({
        kind: "answer",
        label: String(answerLabel).slice(0, 80),
        optionId: letter ? "letter-" + letter : "tq-" + seenOptionEls.length,
        selected: isSelected(tEl),
        freeform: isFreeform || undefined,
        locator: letter
          ? { by: "trayOption", letter: letter }
          : path
            ? { by: "css", selector: path }
            : { by: "buttonText", text: tLabel, index: 0 },
      });
    }
  }

  var toolbarActions = document.querySelectorAll(
    ".composer-questionnaire-toolbar-actions button, .composer-questionnaire-toolbar-actions [role='button'], " +
      ".ui-tray-footer button, .ui-tray-footer [role='button'], " +
      "[class*='ui-tray-footer'] button, [class*='ui-tray-footer'] [role='button'], " +
      ".ui-prompt-input-header-tray button, [class*='ui-prompt-input-header-tray'] button"
  );
  for (var ta = 0; ta < toolbarActions.length; ta++) {
    var aEl = toolbarActions[ta];
    var arBox = aEl.getBoundingClientRect();
    if (arBox.width < 8 || arBox.height < 8) continue;
    var aLabel = (aEl.innerText || aEl.getAttribute("aria-label") || "")
      .trim()
      .replace(/\\s+/g, " ")
      .replace(/[⏎↵]+/g, "")
      .trim();
    if (!aLabel) continue;
    if (/submit|continue|done|send/i.test(aLabel)) push("allow", aLabel, aEl);
    else if (/skip/i.test(aLabel)) push("skip", aLabel, aEl);
    else if (/cancel/i.test(aLabel)) push("reject", aLabel, aEl);
  }

  // AskQuestion pending options inside ask blocks (fallback)
  var askRoots = document.querySelectorAll(
    ".composer-ask-question-tool-call-block, [class*='ask-question-tool']"
  );
  for (var ar = 0; ar < askRoots.length; ar++) {
    var root = askRoots[ar];
    // Prefer interactive controls that are not merely the answered summary
    var candidates = root.querySelectorAll(
      "button, [role='button'], [role='radio'], [role='option'], [role='checkbox'], label, [class*='option'], [data-option-id]"
    );
    for (var o = 0; o < candidates.length; o++) {
      var opt = candidates[o];
      if (!visible(opt)) continue;
      if (opt.closest(".user-questionnaire-answer-value") && !opt.matches("button, [role='button'], [role='radio']")) {
        continue;
      }
      var olabel = (opt.innerText || opt.getAttribute("aria-label") || "").trim().replace(/\\s+/g, " ");
      if (!olabel || olabel.length > 160) continue;
      if (/^(answer|run|skip|allow|accept|reject)$/i.test(olabel)) continue;
      // Skip pure question prompt text nodes mistaken as options
      if (opt.classList && opt.classList.contains("user-questionnaire-question-text")) continue;
      push("answer", olabel, opt, "opt-" + ar + "-" + o);
    }
  }

  // Also tool placeholders with radios/buttons
  var optionNodes = document.querySelectorAll(
    "[data-react-transcript-row-kind='toolPlaceholder'] [role='radio'], [data-react-transcript-row-kind='toolPlaceholder'] [role='option'], [data-react-transcript-row-kind='toolPlaceholder'] button"
  );
  for (var p = 0; p < optionNodes.length; p++) {
    var node = optionNodes[p];
    if (!visible(node)) continue;
    var label = (node.innerText || node.getAttribute("aria-label") || "").trim();
    if (!label || label.length > 160) continue;
    if (/^(run|skip|allow|accept|reject|answer)$/i.test(label)) continue;
    push("answer", label, node, "ph-" + p);
  }

  return { ok: true, actions: actions };
})()`;

/** Click an element by locator. Plain JS for CDP evaluate. */
export function buildClickActionSource(
  locator: {
    by: "css" | "buttonText" | "aria" | "trayOption";
    selector?: string;
    text?: string;
    index?: number;
    label?: string;
    letter?: string;
  },
  opts?: { submitContinue?: boolean },
): string {
  const payload = JSON.stringify(locator);
  const submitContinue = opts?.submitContinue === true;
  return `(() => {
    var loc = ${payload};
    var submitContinue = ${submitContinue ? "true" : "false"};
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
      try { el.dispatchEvent(new PointerEvent("pointerdown", Object.assign({ pointerId: 1, pointerType: "mouse" }, opts))); } catch (e) {}
      el.dispatchEvent(new MouseEvent("mousedown", opts));
      try { el.dispatchEvent(new PointerEvent("pointerup", Object.assign({ pointerId: 1, pointerType: "mouse" }, opts))); } catch (e) {}
      el.dispatchEvent(new MouseEvent("mouseup", opts));
      el.dispatchEvent(new MouseEvent("click", opts));
      if (typeof el.click === "function") el.click();
    }
    function findTrayOption(letter) {
      var nodes = document.querySelectorAll("button.ui-tray-option, [class*='ui-tray-option']");
      for (var i = 0; i < nodes.length; i++) {
        var n = nodes[i];
        if (!visible(n)) continue;
        var cls = n.className && n.className.toString ? n.className.toString() : "";
        if (/tray-option__/i.test(cls)) continue; // badge/label leaves
        var badge = n.querySelector("[class*='ui-tray-option__badge']");
        var b = badge && badge.innerText ? badge.innerText.trim() : "";
        if (b === letter) return n;
      }
      return null;
    }
    function findContinue() {
      var btns = document.querySelectorAll(
        ".ui-tray-footer button, [class*='ui-tray-footer'] button, .composer-questionnaire-toolbar-actions button"
      );
      for (var i = 0; i < btns.length; i++) {
        var t = (btns[i].innerText || btns[i].getAttribute("aria-label") || "").trim();
        if (/continue|submit|done/i.test(t) && visible(btns[i])) return btns[i];
      }
      return null;
    }
    var el = null;
    if (loc.by === "trayOption" && loc.letter) {
      el = findTrayOption(loc.letter);
    } else if (loc.by === "css" && loc.selector) {
      try { el = document.querySelector(loc.selector); } catch (e) { el = null; }
    } else if (loc.by === "aria" && loc.label) {
      var nodes = document.querySelectorAll("button, [role='button']");
      for (var i = 0; i < nodes.length; i++) {
        if ((nodes[i].getAttribute("aria-label") || "") === loc.label && visible(nodes[i])) {
          el = nodes[i];
          break;
        }
      }
    } else if (loc.by === "buttonText" && loc.text) {
      var buttons = [];
      var all = document.querySelectorAll("button, [role='button'], [role='radio'], [role='option']");
      for (var j = 0; j < all.length; j++) {
        var t = (all[j].innerText || all[j].getAttribute("aria-label") || "").trim().replace(/\\s+/g, " ");
        if (t === loc.text && visible(all[j])) buttons.push(all[j]);
      }
      el = buttons[loc.index || 0] || null;
    }
    if (!el) return { ok: false, error: "Action target not found" };
    fireClick(el);
    if (submitContinue) {
      var cont = findContinue();
      if (cont) {
        fireClick(cont);
        return { ok: true, submitted: true };
      }
      return { ok: true, submitted: false, warning: "Selected but Continue not found" };
    }
    return { ok: true };
  })()`;
}
