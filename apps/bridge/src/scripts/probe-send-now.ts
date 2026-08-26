/**
 * Verify composer insert + locate Send/Queue without submitting to the chat.
 * Pass --submit only when you intentionally want a live send test.
 */
import { loadConfig } from "../config.js";
import { isWorkbenchTarget, listCdpTargets } from "../cdp/discover.js";
import { CdpClient } from "../cdp/client.js";
import { sendComposerMessage } from "../commands/send-message.js";

const doSubmit = process.argv.includes("--submit");
const config = loadConfig();
const targets = (await listCdpTargets(config.cdpHttpUrl)).filter(isWorkbenchTarget);
const page = targets.find((t) => /agents/i.test(t.title)) ?? targets[0];
console.log("using", page!.title, doSubmit ? "(WILL SUBMIT)" : "(dry-run, no submit)");
const client = new CdpClient(page!.webSocketDebuggerUrl!);
await client.connect();
await client.bringToFront();

const marker = `cma-dry-${Date.now()}`;

if (doSubmit) {
  const result = await sendComposerMessage(client, marker);
  console.log("send result", result);
} else {
  const typed = await client.evaluate(`(() => {
    const el = document.querySelector(
      '.ui-prompt-input [data-editor-owns-history="true"], [data-editor-owns-history="true"]'
    );
    if (!el) return { ok: false, reason: "no editor" };
    el.focus();
    document.execCommand("selectAll", false);
    document.execCommand("insertText", false, ${JSON.stringify(marker)});
    const text = (el.innerText || "").trim();
    const prompt = el.closest(".ui-prompt-input");
    const submit = prompt && prompt.querySelector(".ui-prompt-input-submit-button");
    return {
      ok: text.includes(${JSON.stringify(marker)}),
      text: text.slice(0, 80),
      submitAria: submit ? submit.getAttribute("aria-label") : null,
    };
  })()`);
  console.log("dry-run insert", typed);

  // Always clear so leftover probe text is never sent by hand/Enter.
  await client.evaluate(`(() => {
    const el = document.querySelector(
      '.ui-prompt-input [data-editor-owns-history="true"], [data-editor-owns-history="true"]'
    );
    if (!el) return;
    el.focus();
    document.execCommand("selectAll", false);
    document.execCommand("delete", false);
  })()`);
  console.log("composer cleared");
}

client.close();
