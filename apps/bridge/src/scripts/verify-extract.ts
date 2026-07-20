/**
 * Verify extract + composer typing WITHOUT submitting (no Enter).
 */
import { loadConfig } from "../config.js";
import { isWorkbenchTarget, listCdpTargets } from "../cdp/discover.js";
import { CdpClient } from "../cdp/client.js";
import { EXTRACT_COMPOSER_UI_SOURCE } from "../extract/composer-source.js";

const config = loadConfig();
const targets = (await listCdpTargets(config.cdpHttpUrl)).filter(isWorkbenchTarget);
const client = new CdpClient(targets[0]!.webSocketDebuggerUrl!);
await client.connect();
await client.bringToFront();

const extracted = await client.evaluate<{
  ok: boolean;
  reason?: string;
  phase: string;
  activityText?: string;
  timeline: Array<{ kind: string; text?: string; markdown?: string }>;
}>(EXTRACT_COMPOSER_UI_SOURCE);

console.log(
  JSON.stringify(
    {
      ok: extracted.ok,
      phase: extracted.phase,
      activityText: extracted.activityText,
      timelineCount: extracted.timeline?.length ?? 0,
      lastUser: [...(extracted.timeline || [])]
        .reverse()
        .find((i) => i.kind === "user"),
      lastAssistant: [...(extracted.timeline || [])]
        .reverse()
        .find((i) => i.kind === "assistant"),
    },
    null,
    2,
  ),
);

const marker = `cma-ping-${Date.now()}`;
const target = await client.evaluate<{
  found: boolean;
  selector?: string;
  x?: number;
  y?: number;
  all?: Array<{ top: number; bottom: number; w: number; h: number }>;
}>(`(() => {
  const selectors = [
    '.composer-bar .tiptap.ProseMirror.ui-prompt-input-editor__input',
    '.composer-bar [data-editor-owns-history="true"]',
    '.composer-bar [contenteditable="true"]',
    '[data-editor-owns-history="true"]',
  ];
  const vh = window.innerHeight;
  const vw = window.innerWidth;
  const isBad = (n) =>
    !!n.closest("[data-prompt-input-tiptap-readonly], .composer-human-message, .aislash-editor-input-readonly") ||
    /readonly/i.test(n.className && n.className.toString ? n.className.toString() : "");
  for (const sel of selectors) {
    const nodes = [...document.querySelectorAll(sel)];
    for (const n of nodes) n.scrollIntoView({ block: "nearest", inline: "nearest" });
    const el = nodes.find((n) => {
      if (isBad(n)) return false;
      const r = n.getBoundingClientRect();
      return r.width > 40 && r.height > 10 && r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw;
    });
    if (!el) continue;
    const r = el.getBoundingClientRect();
    return {
      found: true,
      selector: sel,
      x: r.left + r.width / 2,
      y: r.top + Math.min(Math.max(r.height / 2, 8), 20),
      all: nodes.map((n) => {
        const b = n.getBoundingClientRect();
        return { top: b.top, bottom: b.bottom, w: b.width, h: b.height, bad: isBad(n) };
      }),
    };
  }
  return { found: false };
})()`);

console.log("target", target);
if (target.found && target.x != null && target.y != null) {
  const click = async () => {
    await client.send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x: Math.round(target.x!),
      y: Math.round(target.y!),
      button: "left",
      clickCount: 1,
    });
    await client.send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x: Math.round(target.x!),
      y: Math.round(target.y!),
      button: "left",
      clickCount: 1,
    });
  };

  await click();
  await client.keyDown("a", { ctrlKey: true });
  await client.keyUp("a", { ctrlKey: true });
  await client.keyDown("Backspace");
  await client.keyUp("Backspace");
  await client.insertText(marker);

  let typed = await client.evaluate<string>(`(() => {
    const el = document.querySelector('.composer-bar [contenteditable="true"], [data-editor-owns-history="true"]');
    return (el && el.innerText || "").trim();
  })()`);
  console.log("after insertText", {
    ok: typed.includes(marker),
    typed: typed.slice(0, 100),
  });

  if (!typed.includes(marker)) {
    await click();
    await client.evaluate(`(() => {
      const el = document.querySelector('.composer-bar [contenteditable="true"], [data-editor-owns-history="true"]');
      if (!el) return;
      el.focus();
      document.execCommand('selectAll', false);
      document.execCommand('insertText', false, ${JSON.stringify(marker)});
    })()`);
    typed = await client.evaluate<string>(`(() => {
      const el = document.querySelector('.composer-bar [contenteditable="true"], [data-editor-owns-history="true"]');
      return (el && el.innerText || "").trim();
    })()`);
    console.log("after execCommand", {
      ok: typed.includes(marker),
      typed: typed.slice(0, 100),
    });
  }

  // Clear so we don't leave junk
  await click();
  await client.keyDown("a", { ctrlKey: true });
  await client.keyUp("a", { ctrlKey: true });
  await client.keyDown("Backspace");
  await client.keyUp("Backspace");
}

client.close();
