/**
 * Probe Agents composer for image/attachment affordances (read-only).
 */
import { loadConfig } from "../config.js";
import { isWorkbenchTarget, listCdpTargets } from "../cdp/discover.js";
import { CdpClient } from "../cdp/client.js";

const config = loadConfig();
const targets = (await listCdpTargets(config.cdpHttpUrl)).filter(isWorkbenchTarget);
const page = targets.find((t) => /agents/i.test(t.title)) ?? targets[0];
const client = new CdpClient(page!.webSocketDebuggerUrl!);
await client.connect();

const info = await client.evaluate(`(() => {
  const prompt = document.querySelector(".ui-prompt-input");
  const editor = document.querySelector(
    '.ui-prompt-input [data-editor-owns-history="true"], [data-editor-owns-history="true"]'
  );
  function btnInfo(b) {
    const r = b.getBoundingClientRect();
    return {
      aria: b.getAttribute("aria-label"),
      title: b.getAttribute("title"),
      type: b.getAttribute("type"),
      cls: (b.className && b.className.toString ? b.className.toString() : "").slice(0, 100),
      w: Math.round(r.width),
      h: Math.round(r.height),
    };
  }
  const scope = prompt || document.body;
  const buttons = [...scope.querySelectorAll("button, [role=button], input[type=file], label")].map(btnInfo);
  const fileInputs = [...document.querySelectorAll("input[type=file]")].map((i) => ({
    accept: i.getAttribute("accept"),
    multiple: i.multiple,
    cls: (i.className || "").toString().slice(0, 80),
    id: i.id,
    hidden: i.hidden || i.style.display === "none",
  }));
  const imgs = [...document.querySelectorAll(".ui-prompt-input img, [class*='attachment'] img, [class*='composer'] img")]
    .slice(0, 10)
    .map((img) => ({
      src: (img.getAttribute("src") || "").slice(0, 60),
      alt: img.getAttribute("alt"),
      w: img.width,
      h: img.height,
    }));
  const dropZones = [...document.querySelectorAll("[class*='drop'], [class*='attach'], [data-drop]")]
    .slice(0, 15)
    .map((el) => ({
      tag: el.tagName,
      cls: (el.className || "").toString().slice(0, 100),
      aria: el.getAttribute("aria-label"),
    }));
  return {
    hasPrompt: !!prompt,
    hasEditor: !!editor,
    editorContentEditable: editor && editor.getAttribute("contenteditable"),
    plus: buttons.filter((b) => /plus|add|attach|image|photo|upload|context|file|media/i.test(
      (b.aria || "") + " " + (b.title || "") + " " + (b.cls || "")
    )),
    allPromptButtons: buttons.slice(0, 20),
    fileInputs,
    imgs,
    dropZones,
  };
})()`);

console.log(JSON.stringify(info, null, 2));
client.close();
