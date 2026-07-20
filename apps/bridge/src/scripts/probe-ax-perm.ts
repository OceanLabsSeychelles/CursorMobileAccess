/**
 * Use CDP Accessibility tree + DOM search for Skip/Always Run/Run.
 */
import fs from "node:fs";
import { loadConfig } from "../config.js";
import { isWorkbenchTarget, listCdpTargets } from "../cdp/discover.js";
import { CdpClient } from "../cdp/client.js";

const out = new URL("../../../../tmp-ax-perm.json", import.meta.url);
const config = loadConfig();
const all = await listCdpTargets(config.cdpHttpUrl);
console.log("targets", JSON.stringify(all.map((t) => ({ type: t.type, title: t.title, url: (t.url || "").slice(0, 100) })), null, 2));

const page = all.find(isWorkbenchTarget) || all.find((t) => t.type === "page");
if (!page?.webSocketDebuggerUrl) {
  console.error("no page");
  process.exit(1);
}

const client = new CdpClient(page.webSocketDebuggerUrl);
await client.connect();

// Enable Accessibility domain
await client.send("Accessibility.enable", {});
const ax = (await client.send("Accessibility.getFullAXTree", {})) as {
  nodes?: Array<{
    role?: { value?: string };
    name?: { value?: string };
    properties?: Array<{ name?: string; value?: { value?: unknown } }>;
    backendDOMNodeId?: number;
  }>;
};

const interesting = (ax.nodes || []).filter((n) => {
  const name = n.name?.value || "";
  const role = n.role?.value || "";
  return (
    /^(Skip|Run|Always Run|Always Run Selected|Auto-review)$/i.test(name.trim()) ||
    (/skip|always run|^run$/i.test(name) && name.length < 48) ||
    (/button/i.test(role) && /skip|run|allow/i.test(name) && name.length < 48)
  );
});

const bodyProbe = await client.evaluate(`(() => {
  const text = document.body.innerText || "";
  return {
    len: text.length,
    hasSkip: /\\bSkip\\b/.test(text),
    hasAlways: /Always\\s+Run/.test(text),
    hasAuto: /Auto-review/i.test(text),
    hasHello: /hello-world/i.test(text),
    hasClassifying: /classifying this action/i.test(text),
    // last 2000 chars often includes live tool UI
    tail: text.slice(-2000),
  };
})()`);

fs.writeFileSync(
  out,
  JSON.stringify(
    {
      at: new Date().toISOString(),
      interestingCount: interesting.length,
      interesting: interesting.slice(0, 40),
      bodyProbe,
    },
    null,
    2,
  ),
);

console.log(JSON.stringify({
  interestingCount: interesting.length,
  interesting: interesting.slice(0, 20).map((n) => ({
    role: n.role?.value,
    name: n.name?.value,
    backendDOMNodeId: n.backendDOMNodeId,
  })),
  bodyProbe: {
    ...bodyProbe,
    tail: bodyProbe.tail?.slice(-800),
  },
}, null, 2));

client.close();
