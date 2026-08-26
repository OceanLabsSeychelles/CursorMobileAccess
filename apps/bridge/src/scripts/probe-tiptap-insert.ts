/**
 * Diagnose TipTap composer insert failures (no submit).
 */
import { loadConfig } from "../config.js";
import { isWorkbenchTarget, listCdpTargets } from "../cdp/discover.js";
import { CdpClient } from "../cdp/client.js";

const config = loadConfig();
const targets = (await listCdpTargets(config.cdpHttpUrl)).filter(isWorkbenchTarget);
const page = targets.find((t) => /agents/i.test(t.title)) ?? targets[0];
if (!page?.webSocketDebuggerUrl) {
  console.error("No Agents CDP target");
  process.exit(1);
}
console.log("target", page.title, page.id);

const client = new CdpClient(page.webSocketDebuggerUrl);
await client.connect();
await client.bringToFront();

const inventory = await client.evaluate(`(() => {
  function info(n) {
    const r = n.getBoundingClientRect();
    const cls = n.className && n.className.toString ? n.className.toString() : "";
    return {
      tag: n.tagName,
      role: n.getAttribute("role"),
      contentEditable: n.getAttribute("contenteditable"),
      ownsHistory: n.getAttribute("data-editor-owns-history"),
      cls: cls.slice(0, 160),
      text: (n.innerText || "").slice(0, 60),
      rect: { t: Math.round(r.top), l: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height) },
      visible: r.width > 0 && r.height > 0,
      readonly: !!n.closest("[data-prompt-input-tiptap-readonly], .composer-human-message, .aislash-editor-input-readonly") || /readonly/i.test(cls),
      inComposerBar: !!n.closest(".composer-bar"),
      inPrompt: !!n.closest(".ui-prompt-input"),
      active: document.activeElement === n,
    };
  }
  const sels = [
    '.composer-bar .tiptap.ProseMirror.ui-prompt-input-editor__input',
    '.composer-bar [data-editor-owns-history="true"]',
    '.composer-bar [contenteditable="true"]',
    '[data-editor-owns-history="true"]',
    '.tiptap.ProseMirror',
    '[contenteditable="true"]',
    'div[role="textbox"]',
  ];
  const out = {};
  for (const sel of sels) {
    out[sel] = [...document.querySelectorAll(sel)].slice(0, 8).map(info);
  }
  const ae = document.activeElement;
  out.activeElement = ae ? info(ae) : null;
  return out;
})()`);

console.log(JSON.stringify(inventory, null, 2));

const marker = `cma-probe-${Date.now()}`;

const pick = await client.evaluate(`(() => {
  const selectors = [
    '.composer-bar .tiptap.ProseMirror.ui-prompt-input-editor__input',
    '.composer-bar [data-editor-owns-history="true"]',
    '.composer-bar [contenteditable="true"]',
    '[data-editor-owns-history="true"]',
    ".aislash-editor-input",
    'div[role="textbox"][contenteditable="true"]',
    '.tiptap.ProseMirror[contenteditable="true"]',
  ];
  const vh = window.innerHeight || 800;
  const vw = window.innerWidth || 1200;
  for (const sel of selectors) {
    const nodes = [...document.querySelectorAll(sel)];
    for (const n of nodes) n.scrollIntoView({ block: "nearest", inline: "nearest" });
    const el = nodes.find((n) => {
      if (n.closest("[data-prompt-input-tiptap-readonly], .composer-human-message, .aislash-editor-input-readonly")) return false;
      const cls = n.className && n.className.toString ? n.className.toString() : "";
      if (/readonly/i.test(cls)) return false;
      const r = n.getBoundingClientRect();
      return r.width > 40 && r.height > 10 && r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw;
    });
    if (!el) continue;
    const r = el.getBoundingClientRect();
    return { found: true, selector: sel, x: r.left + r.width / 2, y: r.top + Math.min(Math.max(r.height / 2, 8), 20) };
  }
  return { found: false };
})()`) as { found: boolean; selector?: string; x?: number; y?: number };

console.log("pick", pick);
if (!pick.found || pick.x == null || pick.y == null) {
  client.close();
  process.exit(2);
}

async function click(x: number, y: number) {
  await client.send("Input.dispatchMouseEvent", { type: "mousePressed", x: Math.round(x), y: Math.round(y), button: "left", clickCount: 1 });
  await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: Math.round(x), y: Math.round(y), button: "left", clickCount: 1 });
}

await click(pick.x, pick.y);
await new Promise((r) => setTimeout(r, 100));

const methods: Array<{ name: string; run: () => Promise<unknown> }> = [
  {
    name: "execCommand insertText",
    run: () =>
      client.evaluate(`(() => {
        const el = document.querySelector(${JSON.stringify(pick.selector)});
        if (!el) return { ok: false, why: "missing" };
        el.focus();
        document.execCommand("selectAll", false);
        const ok = document.execCommand("insertText", false, ${JSON.stringify(marker)});
        return { ok, text: (el.innerText||"").slice(0,80), has: (el.innerText||"").includes(${JSON.stringify(marker)}) };
      })()`),
  },
  {
    name: "Input.insertText CDP",
    run: async () => {
      await click(pick.x!, pick.y!);
      await client.keyDown("a", { ctrlKey: true });
      await client.keyUp("a", { ctrlKey: true });
      await client.keyDown("Backspace");
      await client.keyUp("Backspace");
      await client.insertText(marker);
      return client.evaluate(`(() => {
        const el = document.querySelector(${JSON.stringify(pick.selector)});
        const t = (el && el.innerText || "");
        return { text: t.slice(0,80), has: t.includes(${JSON.stringify(marker)}) };
      })()`);
    },
  },
  {
    name: "beforeinput InputEvent",
    run: () =>
      client.evaluate(`(() => {
        const el = document.querySelector(${JSON.stringify(pick.selector)});
        if (!el) return { ok: false };
        el.focus();
        document.execCommand("selectAll", false);
        document.execCommand("delete", false);
        const before = new InputEvent("beforeinput", { bubbles: true, cancelable: true, inputType: "insertText", data: ${JSON.stringify(marker)} });
        const cancelled = !el.dispatchEvent(before);
        if (!cancelled) {
          // TipTap often handles beforeinput itself; if not cancelled, try insertText again
          document.execCommand("insertText", false, ${JSON.stringify(marker)});
        }
        const t = el.innerText || "";
        return { cancelled, text: t.slice(0,80), has: t.includes(${JSON.stringify(marker)}) };
      })()`),
  },
  {
    name: "textContent + input events",
    run: () =>
      client.evaluate(`(() => {
        const el = document.querySelector(${JSON.stringify(pick.selector)});
        if (!el) return { ok: false };
        el.focus();
        // TipTap needs ProseMirror transaction; raw textContent often ignored, but try PM view path
        const view = el.pmViewDesc && el.pmViewDesc.view;
        if (view && view.dispatch && view.state) {
          const { state } = view;
          const tr = state.tr.insertText(${JSON.stringify(marker)}, 0, state.doc.content.size);
          view.dispatch(tr);
          const t = el.innerText || "";
          return { via: "pmView", text: t.slice(0,80), has: t.includes(${JSON.stringify(marker)}) };
        }
        // Fallback: find ProseMirror view on parent
        let node = el;
        for (let i = 0; i < 6 && node; i++) {
          const v = node.__vueParentComponent || node.editorView || node.pmViewDesc?.view;
          if (v && v.state && v.dispatch) {
            const tr = v.state.tr.insertText(${JSON.stringify(marker)}, 0, v.state.doc.content.size);
            v.dispatch(tr);
            const t = el.innerText || "";
            return { via: "parentView", text: t.slice(0,80), has: t.includes(${JSON.stringify(marker)}) };
          }
          // TipTap Editor instance sometimes on closest
          const tip = node.editor || (node.parentElement && node.parentElement.editor);
          if (tip && tip.commands && tip.commands.setContent) {
            tip.commands.clearContent();
            tip.commands.insertContent(${JSON.stringify(marker)});
            const t = el.innerText || "";
            return { via: "tiptap", text: t.slice(0,80), has: t.includes(${JSON.stringify(marker)}) };
          }
          node = node.parentElement;
        }
        return { via: "none", text: (el.innerText||"").slice(0,80), keys: Object.keys(el).filter(k => /pm|view|editor|tip/i.test(k)).slice(0,20) };
      })()`),
  },
];

for (const m of methods) {
  // clear first
  await click(pick.x, pick.y);
  await client.evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(pick.selector)});
    if (!el) return;
    el.focus();
    document.execCommand("selectAll", false);
    document.execCommand("delete", false);
  })()`);
  await new Promise((r) => setTimeout(r, 50));
  try {
    const result = await m.run();
    console.log("\\n===", m.name, "===");
    console.log(JSON.stringify(result, null, 2));
  } catch (e) {
    console.log("\\n===", m.name, "ERROR ===");
    console.log(String(e));
  }
}

// cleanup
await click(pick.x, pick.y);
await client.evaluate(`(() => {
  const el = document.querySelector(${JSON.stringify(pick.selector)});
  if (!el) return;
  el.focus();
  document.execCommand("selectAll", false);
  document.execCommand("delete", false);
})()`);
client.close();
