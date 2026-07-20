/**
 * Probe pending approval / question UI in Cursor Agents Window.
 */
import { loadConfig } from "../config.js";
import { isWorkbenchTarget, listCdpTargets } from "../cdp/discover.js";
import { CdpClient } from "../cdp/client.js";

const config = loadConfig();
const targets = (await listCdpTargets(config.cdpHttpUrl)).filter(isWorkbenchTarget);
const client = new CdpClient(targets[0]!.webSocketDebuggerUrl!);
await client.connect();

const probe = await client.evaluate(`(() => {
  const buttons = [...document.querySelectorAll("button, [role='button']")].map((b, i) => {
    const r = b.getBoundingClientRect();
    const text = (b.innerText || "").trim().slice(0, 80);
    const aria = b.getAttribute("aria-label");
    const cls = (b.className && b.className.toString ? b.className.toString() : "").slice(0, 120);
    return {
      i,
      text,
      aria,
      cls,
      visible: r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight,
      top: Math.round(r.top),
      left: Math.round(r.left),
    };
  }).filter((b) => b.visible && (
    /accept|reject|approve|run|skip|allow|continue|build|deny|yes|no/i.test(b.text + " " + (b.aria || "")) ||
    /composer-run|composer-skip|anysphere/i.test(b.cls)
  ));

  const placeholders = [...document.querySelectorAll("[data-react-transcript-row-kind='toolPlaceholder']")].map((el) => ({
    text: (el.innerText || "").trim().slice(0, 300),
    buttons: [...el.querySelectorAll("button, [role='button']")].map((b) => ({
      text: (b.innerText || "").trim().slice(0, 60),
      aria: b.getAttribute("aria-label"),
    })),
  }));

  const questions = [...document.querySelectorAll("[class*='question'], [data-message-kind], [class*='AskQuestion'], [class*='options']")].slice(0, 20).map((el) => ({
    cls: (el.className && el.className.toString ? el.className.toString() : "").slice(0, 100),
    text: (el.innerText || "").trim().slice(0, 150),
  }));

  const radioish = [...document.querySelectorAll("[role='radio'], [role='option'], input[type='radio']")].slice(0, 20).map((el) => ({
    role: el.getAttribute("role"),
    text: (el.innerText || el.getAttribute("aria-label") || "").trim().slice(0, 80),
  }));

  return { buttons, placeholders, questions, radioish, composerStatus: document.querySelector("[data-composer-status]")?.getAttribute("data-composer-status") };
})()`);

console.log(JSON.stringify(probe, null, 2));
client.close();
