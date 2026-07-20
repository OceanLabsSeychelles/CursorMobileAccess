/**
 * Broader DOM probe for Agents Window / Composer structure.
 * Usage: npx tsx src/scripts/probe-dom.ts
 */
import { loadConfig } from "../config.js";
import { isWorkbenchTarget, listCdpTargets } from "../cdp/discover.js";
import { CdpClient } from "../cdp/client.js";

const config = loadConfig();
const targets = (await listCdpTargets(config.cdpHttpUrl)).filter(isWorkbenchTarget);
if (!targets[0]?.webSocketDebuggerUrl) {
  console.error("No workbench target");
  process.exit(1);
}

const client = new CdpClient(targets[0].webSocketDebuggerUrl);
await client.connect();

const probe = await client.evaluate(`(() => {
  const count = (sel) => document.querySelectorAll(sel).length;
  const sample = (sel, n = 5) => [...document.querySelectorAll(sel)].slice(0, n).map((el) => ({
    tag: el.tagName,
    id: el.id || null,
    className: (el.className?.toString?.() || "").slice(0, 160),
    role: el.getAttribute("role"),
    aria: el.getAttribute("aria-label"),
    dataAttrs: [...el.attributes].filter(a => a.name.startsWith("data-")).map(a => a.name + "=" + a.value.slice(0, 40)),
    text: (el.innerText || "").trim().slice(0, 100),
  }));

  // Collect unique data-* attribute names in the document
  const dataNames = new Set();
  document.querySelectorAll("*").forEach((el) => {
    for (const a of el.attributes) {
      if (a.name.startsWith("data-")) dataNames.add(a.name);
    }
  });

  const editable = sample('[contenteditable="true"]', 8);
  const textareas = sample("textarea", 5);
  const buttons = [...document.querySelectorAll("button")].slice(0, 30).map((b) => ({
    text: (b.innerText || "").trim().slice(0, 60),
    aria: b.getAttribute("aria-label"),
    className: (b.className?.toString?.() || "").slice(0, 100),
  }));

  // Likely chat container heuristics
  const interestingClasses = [];
  document.querySelectorAll("[class]").forEach((el) => {
    const c = el.className?.toString?.() || "";
    if (/composer|agent|chat|message|timeline|prompt|aislash|prosemirror|bubble/i.test(c)) {
      interestingClasses.push(c.slice(0, 140));
    }
  });
  const uniqueInteresting = [...new Set(interestingClasses)].slice(0, 40);

  return {
    title: document.title,
    bodyTextPreview: (document.body?.innerText || "").slice(0, 800),
    counts: {
      dataFlatIndex: count("[data-flat-index]"),
      dataMessageRole: count("[data-message-role]"),
      contenteditable: count('[contenteditable="true"]'),
      textarea: count("textarea"),
      proseMirror: count(".ProseMirror, [class*=ProseMirror]"),
      agentSidebar: count(".agent-sidebar-cell, [class*=agent-sidebar]"),
      markdownRoot: count(".markdown-root, [class*=markdown-root]"),
    },
    dataAttrNames: [...dataNames].sort().slice(0, 80),
    editable,
    textareas,
    buttons,
    uniqueInteresting,
  };
})()`);

console.log(JSON.stringify(probe, null, 2));
client.close();
