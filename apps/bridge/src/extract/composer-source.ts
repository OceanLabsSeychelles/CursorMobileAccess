/** In-page extractor source. Plain JS only — evaluated via CDP Runtime.evaluate. */
export const EXTRACT_COMPOSER_UI_SOURCE = `(() => {
  try {
    var timeline = [];
    var seen = Object.create(null);

    function push(item) {
      if (seen[item.id]) return;
      seen[item.id] = true;
      timeline.push(item);
    }

    /** Strip Run / Skip / Always Run control chrome that leaks into tool row text. */
    function stripPermissionChrome(text) {
      return String(text || "")
        .split("\\n")
        .map(function (l) {
          return l.trim();
        })
        .filter(function (l) {
          if (!l) return false;
          if (/^(skip|run|always\\s+run(\\s+selected)?)(\\s|$)/i.test(l)) return false;
          if (/^always\\s+run\\b/i.test(l)) return false;
          if (/^auto-review$/i.test(l)) return false;
          if (/classifying this action/i.test(l)) return false;
          return true;
        })
        .join("\\n")
        .trim();
    }

    function readableText(el) {
      if (!el) return "";
      var clone = el.cloneNode(true);
      var kill = clone.querySelectorAll(
        ".composer-tool-call-control-row, .composer-tool-call-allowlist-button-wrapper, " +
          ".composer-run-button, .composer-skip-button, [class*='composer-run-button'], [class*='composer-skip-button'], " +
          "[class*='ui-tool-approval-gate'], [class*='tool-approval-gate'], " +
          ".ui-shell-tool-call button, [class*='ui-shell-tool-call'] button, " +
          "[class*='ui-shell-tool-call__allowlist-button-wrapper']"
      );
      for (var k = 0; k < kill.length; k++) {
        if (kill[k].parentNode) kill[k].parentNode.removeChild(kill[k]);
      }
      return stripPermissionChrome((clone.innerText || "").trim());
    }

    var plane =
      document.querySelector(
        ".virtualized-composer-messages-virtual-plane, .composer-messages-container, .agent-panel-conversation-shell"
      ) || document.body;

    var nodes = Array.prototype.slice.call(
      plane.querySelectorAll(
        "[data-message-role], [data-react-transcript-row-kind], [data-flat-index]"
      )
    );

    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var role = (el.getAttribute("data-message-role") || "").toLowerCase();
      var msgKind = (el.getAttribute("data-message-kind") || "").toLowerCase();
      var rowKind = el.getAttribute("data-react-transcript-row-kind") || "";
      var msgId =
        el.getAttribute("data-message-id") ||
        el.getAttribute("data-react-transcript-row-key") ||
        el.getAttribute("data-flat-index") ||
        "node-" + timeline.length;

      if (role === "human" || msgKind === "human") {
        var readonly = el.querySelector(
          ".aislash-editor-input-readonly, [class*='aislash-editor-input-readonly'], [data-prompt-input-tiptap-readonly]"
        );
        var text = ((readonly && readonly.innerText) || el.innerText || "").trim();
        if (text) push({ id: msgId, kind: "user", text: text });
        continue;
      }

      if (
        msgKind === "assistant" ||
        (role === "ai" && msgKind === "assistant") ||
        rowKind === "assistantMarkdown"
      ) {
        var md = el.querySelector(".markdown-root, [class*='markdown-root']");
        var markdown = ((md && md.innerText) || el.innerText || "").trim();
        if (markdown) push({ id: msgId, kind: "assistant", markdown: markdown });
        continue;
      }

      // Noise rows from Agents Window chrome
      if (
        rowKind === "turnActions" ||
        rowKind === "workGroup" ||
        rowKind === "tailStatus"
      ) {
        continue;
      }

      if (rowKind === "activityGroup" || rowKind === "activity") {
        var raw = readableText(el) || stripPermissionChrome((el.innerText || "").trim());
        if (!raw) continue;
        var lines = raw.split("\\n").map(function (l) { return l.trim(); }).filter(Boolean);
        // Drop duplicated/stat lines like "+", "28", "for 2s" repeats
        var cleaned = [];
        for (var li = 0; li < lines.length; li++) {
          var line = lines[li];
          if (/^[+\\-]?\\d+$/.test(line)) continue;
          if (cleaned.length && cleaned[cleaned.length - 1] === line) continue;
          cleaned.push(line);
        }
        if (!cleaned.length) continue;

        var verb = cleaned[0];
        var detail = cleaned.slice(1).join(" · ").slice(0, 240);

        if (/^thought$/i.test(verb)) {
          var thoughtDetail = cleaned.slice(1).filter(function (l) {
            return cleaned.indexOf(l) === cleaned.lastIndexOf(l) || l !== cleaned[1];
          });
          // Unique consecutive-deduped already; just take first duration-ish line
          var thoughtExtra = cleaned[1] || "";
          push({
            id: msgId,
            kind: "thought",
            summary: thoughtExtra ? ("Thought " + thoughtExtra) : "Thought",
          });
          continue;
        }

        var running = /^(Editing|Running|Exploring|Reading|Searching)/.test(verb);
        var title = detail ? verb + ": " + detail.split(" · ")[0] : verb;
        push({
          id: msgId,
          kind: "tool",
          title: title.slice(0, 200),
          detail: detail && detail.indexOf(" · ") >= 0 ? detail : undefined,
          status: running ? "running" : "done",
        });
        continue;
      }

      if (rowKind === "toolPlaceholder") {
        var ph = readableText(el) || stripPermissionChrome((el.innerText || "").trim());
        if (!ph) continue; // empty placeholder while tool boots — skip
        var askBlock = el.querySelector(
          ".composer-ask-question-tool-call-block, [class*='ask-question'], .user-questionnaire-answers-body"
        );
        if (askBlock || ph.indexOf("Answer") === 0) {
          var qEl = el.querySelector(".user-questionnaire-question-text");
          var prompt = (qEl && qEl.innerText ? qEl.innerText : "").trim();
          if (!prompt) {
            prompt =
              ph
                .replace(/^Answer\\s*/i, "")
                .trim()
                .split("\\n")
                .filter(Boolean)[0] || "Question";
          }
          prompt = prompt.slice(0, 500);
          var optEls = Array.prototype.slice.call(
            el.querySelectorAll(
              ".user-questionnaire-answer-value, [class*='questionnaire-option'], [class*='ask-question-option']"
            )
          );
          var options = [];
          for (var qi = 0; qi < optEls.length; qi++) {
            var ot = (optEls[qi].innerText || "").trim();
            if (ot) options.push({ id: "hist-" + qi, label: ot.slice(0, 200) });
          }
          push({
            id: msgId,
            kind: "question",
            prompt: prompt,
            options: options,
          });
        } else {
          var phLines = ph.split("\\n").map(function (l) { return l.trim(); }).filter(Boolean);
          var phTitle = phLines[0] || "Tool";
          if (phTitle === "Tool" && phLines.length < 2) continue;
          push({
            id: msgId,
            kind: "tool",
            title: (phLines[1] ? phTitle + ": " + phLines[1] : phTitle).slice(0, 200),
            status: "running",
          });
        }
        continue;
      }

      if (
        rowKind.toLowerCase().indexOf("think") >= 0
      ) {
        var summary = (el.innerText || "").trim().split("\\n")[0].slice(0, 200);
        if (summary) push({ id: msgId, kind: "thought", summary: summary });
        continue;
      }

      if (msgKind === "tool" || (role === "ai" && msgKind === "tool")) {
        var askTool = el.querySelector(
          ".composer-ask-question-tool-call-block, .user-questionnaire-answers-body"
        );
        if (askTool) {
          var q2 = el.querySelector(".user-questionnaire-question-text");
          var p2 = ((q2 && q2.innerText) || "").trim().slice(0, 500) || "Question";
          var opts2 = [];
          var oels = el.querySelectorAll(".user-questionnaire-answer-value");
          for (var oj = 0; oj < oels.length; oj++) {
            var ov = (oels[oj].innerText || "").trim();
            if (ov) opts2.push({ id: "hist-" + oj, label: ov.slice(0, 200) });
          }
          push({ id: msgId, kind: "question", prompt: p2, options: opts2 });
          continue;
        }
        var toolRaw = readableText(el) || stripPermissionChrome((el.innerText || "").trim());
        if (!toolRaw) continue;
        var toolLines = toolRaw.split("\\n").map(function (l) { return l.trim(); }).filter(Boolean);
        var toolTitle = toolLines[0];
        if (!toolTitle || toolTitle === "Tool") continue;
        push({
          id: msgId,
          kind: "tool",
          title: (toolLines[1] ? toolTitle + ": " + toolLines[1] : toolTitle).slice(0, 240),
          status: "done",
        });
      }
    }

    var tabs = [];
    var seenTabTitles = Object.create(null);

    function chatTitleFromText(text) {
      return (text || "").trim().split("\\n")[0].trim();
    }

    function isAgentChatButton(el) {
      if (!el) return false;
      // Cursor Agents sidebar uses div[role=button], not <button>
      var isBtn =
        el.tagName === "BUTTON" || el.getAttribute("role") === "button";
      if (!isBtn) return false;
      if (el.getAttribute("data-sidebar-menu-button") == null) return false;
      var cls = el.className && el.className.toString ? el.className.toString() : "";
      if (/ui-sidebar-section-head/.test(cls)) return false;
      if (el.getAttribute("data-action-id")) return false;
      var title = chatTitleFromText(el.innerText || el.getAttribute("aria-label") || "");
      if (!title) return false;
      if (/^(new agent|search|automations|customize|more|pinned)$/i.test(title)) return false;
      if (/pro plan/i.test(el.innerText || "")) return false;
      return true;
    }

    // Agents sidebar chats (primary list)
    var sidebarChats = Array.prototype.slice.call(
      document.querySelectorAll("[data-sidebar-menu-button]")
    );
    for (var s = 0; s < sidebarChats.length; s++) {
      var cell = sidebarChats[s];
      if (!isAgentChatButton(cell)) continue;
      var tabTitle = chatTitleFromText(cell.innerText || "");
      if (seenTabTitles[tabTitle.toLowerCase()]) continue;
      seenTabTitles[tabTitle.toLowerCase()] = true;
      var active =
        cell.getAttribute("data-active") === "true" ||
        cell.getAttribute("aria-current") === "page" ||
        cell.getAttribute("aria-selected") === "true";
      tabs.push({
        id: "chat-" + encodeURIComponent(tabTitle).slice(0, 80),
        title: tabTitle.slice(0, 80),
        active: active,
      });
    }

    // Fallback: top chat title tabs if sidebar empty
    if (!tabs.length) {
      var tabEls = Array.prototype.slice.call(
        document.querySelectorAll(
          ".chat-title-tab-row [role='tab'], .chat-title-tab-tray-root button, .agent-sidebar-cell, [class*='agent-sidebar-cell']"
        )
      );
      for (var t = 0; t < tabEls.length; t++) {
        var tcell = tabEls[t];
        var tTitle =
          tcell.getAttribute("aria-label") ||
          tcell.getAttribute("title") ||
          chatTitleFromText(tcell.innerText || "") ||
          "Chat " + (t + 1);
        if (!tTitle || /new agent|search|ctrl\\+/i.test(tTitle)) continue;
        var tcls = tcell.className && tcell.className.toString ? tcell.className.toString() : "";
        var tactive =
          tcell.getAttribute("aria-selected") === "true" ||
          tcell.getAttribute("data-active") === "true" ||
          tcell.getAttribute("data-selected") === "true" ||
          /(?:^|\\s)(?:selected|is-selected)(?:\\s|$)/i.test(tcls);
        tabs.push({
          id: "tab-" + t + "-" + String(tTitle).slice(0, 40),
          title: String(tTitle).trim().slice(0, 80),
          active: tactive,
        });
      }
    }

    if (tabs.length) {
      var anyActive = false;
      for (var a = 0; a < tabs.length; a++) if (tabs[a].active) anyActive = true;
      if (!anyActive) tabs[0].active = true;
    }

    var modeEl = document.querySelector(
      ".composer-unified-dropdown[data-mode], [data-mode]"
    );
    var mode = modeEl ? modeEl.getAttribute("data-mode") : undefined;
    var modelEl = document.querySelector(
      ".composer-unified-dropdown-model, [class*='dropdown-model']"
    );
    var model = modelEl && modelEl.textContent ? modelEl.textContent.trim() : undefined;

    var statusNode = document.querySelector("[data-composer-status]");
    var composerStatus = statusNode
      ? (statusNode.getAttribute("data-composer-status") || "").toLowerCase()
      : "";

    var loading =
      composerStatus === "generating" ||
      !!document.querySelector(
        ".loading-indicator-v3, [class*='loading-indicator'], [class*='ascii-loading'], [data-react-transcript-row-kind='tailStatus']"
      );

    var awaitingHuman = !!document.querySelector(
      ".composer-run-button, .composer-skip-button, [class*='composer-run-button'], [class*='composer-skip-button'], button[aria-label*='Accept' i], button[aria-label*='Approve' i], button.ui-tray-option, .glass-questionnaire-tray, [class*='glass-questionnaire-tray']"
    );

    // Live AskQuestion prompt lives in the questionnaire tray, not the transcript
    var pendingPrompt = undefined;
    var stepTitle = document.querySelector(
      ".ui-tray-step__title, [class*='ui-tray-step__title']"
    );
    if (stepTitle && stepTitle.innerText) {
      pendingPrompt = stepTitle.innerText.trim().slice(0, 800) || undefined;
    }
    if (!pendingPrompt) {
      var trayBody = document.querySelector(
        ".ui-tray__scroll-area, [class*='ui-tray__scroll-area'], .glass-questionnaire-tray"
      );
      if (trayBody && trayBody.innerText) {
        var lines = trayBody.innerText
          .split("\\n")
          .map(function (l) { return l.trim(); })
          .filter(Boolean);
        // Skip header "Questions" and option lines (single letters / Other...)
        for (var li = 0; li < lines.length; li++) {
          var line = lines[li];
          if (/^questions?$/i.test(line)) continue;
          if (/^[A-Z]$/i.test(line)) continue;
          if (/^others?(?:\\s*\\.\\.\\.|\\s*…)?$/i.test(line)) continue;
          if (/^(skip|continue)$/i.test(line)) continue;
          if (line.length < 8) continue;
          pendingPrompt = line.slice(0, 800);
          break;
        }
      }
    }

    var phase = "idle";
    var activityText = undefined;
    if (pendingPrompt) {
      phase = "awaiting_input";
      activityText = pendingPrompt.slice(0, 120);
      awaitingHuman = true;
    } else if (awaitingHuman) {
      phase = "awaiting_input";
      activityText = "Waiting for approval or input";
    } else if (loading || composerStatus === "generating") {
      phase = "thinking";
      var tail = document.querySelector(
        "[data-react-transcript-row-kind='tailStatus']"
      );
      activityText = ((tail && tail.innerText) || "Generating").trim().split("\\n")[0];
    } else {
      for (var x = 0; x < timeline.length; x++) {
        if (timeline[x].kind === "tool" && timeline[x].status === "running") {
          phase = "tool";
          activityText = "Running tool";
          break;
        }
      }
    }

    return {
      ok: true,
      phase: phase,
      activityText: activityText,
      pendingPrompt: pendingPrompt,
      mode: mode || undefined,
      model: model || undefined,
      tabs: tabs,
      timeline: timeline,
      awaiting: awaitingHuman,
    };
  } catch (err) {
    return {
      ok: false,
      reason: err && err.message ? err.message : "extract failed",
      phase: "error",
      tabs: [],
      timeline: [],
      awaiting: false,
    };
  }
})()`;
