/**
 * One-shot: look for ui-tool-approval-gate and Yo-like short action buttons.
 */
import { loadConfig } from "../config.js";
import { isWorkbenchTarget, listCdpTargets } from "../cdp/discover.js";
import { CdpClient } from "../cdp/client.js";
import { EXTRACT_ACTIONS_SOURCE } from "../extract/actions-source.js";

const config = loadConfig();
const targets = (await listCdpTargets(config.cdpHttpUrl)).filter(isWorkbenchTarget);
const client = new CdpClient(targets[0]!.webSocketDebuggerUrl!);
await client.connect();

const dump = await client.evaluate(`(() => {
  const gates = [...document.querySelectorAll(
    "[class*='ui-tool-approval-gate'], [class*='tool-approval-gate'], [class*='tool-approval']"
  )].map((el) => ({
    cls: ((el.className && el.className.toString) ? el.className.toString() : "").slice(0, 200),
    text: (el.innerText || "").trim().slice(0, 300),
    html: el.outerHTML.slice(0, 1200),
    kids: [...el.querySelectorAll("*")].slice(0, 30).map((k) => ({
      tag: k.tagName,
      role: k.getAttribute("role"),
      aria: k.getAttribute("aria-label"),
      text: (k.innerText || "").trim().slice(0, 40),
      cls: ((k.className && k.className.toString) ? k.className.toString() : "").slice(0, 100),
    })),
  }));

  // Any visible short clickable with Skip/Run/Always
  const clickables = [...document.querySelectorAll("button, [role='button'], [tabindex='0'], a")].filter((el) => {
    const t = ((el.innerText || "") + " " + (el.getAttribute("aria-label") || "")).trim();
    return t.length > 0 && t.length < 50 && /\\b(skip|always\\s*run|\\brun\\b)/i.test(t);
  }).map((el) => {
    const r = el.getBoundingClientRect();
    return {
      tag: el.tagName,
      text: (el.innerText || "").trim().slice(0, 50),
      aria: el.getAttribute("aria-label"),
      cls: ((el.className && el.className.toString) ? el.className.toString() : "").slice(0, 160),
      w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top),
      outer: el.outerHTML.slice(0, 280),
    };
  });

  // Count all buttons
  const btnSample = [...document.querySelectorAll("button")].slice(-30).map((el) => ({
    text: (el.innerText || "").trim().slice(0, 40),
    aria: el.getAttribute("aria-label"),
    cls: ((el.className && el.className.toString) ? el.className.toString() : "").slice(0, 100),
  }));

  return { gateCount: gates.length, gates, clickables, btnSample };
})()`);

const actions = await client.evaluate(EXTRACT_ACTIONS_SOURCE);
console.log(JSON.stringify({ dump, actions }, null, 2));
client.close();
