/**
 * Use browser-level CDP Target.getTargets to find every page/webview.
 */
import WebSocket from "ws";

const version = await fetch("http://127.0.0.1:9222/json/version").then((r) =>
  r.json(),
) as { webSocketDebuggerUrl?: string };
const browserWs = version.webSocketDebuggerUrl;
if (!browserWs) {
  console.error("no browser WS");
  process.exit(1);
}

const ws = new WebSocket(browserWs);
await new Promise<void>((resolve, reject) => {
  ws.on("open", () => resolve());
  ws.on("error", reject);
});

let nextId = 1;
function send(method: string, params?: Record<string, unknown>) {
  const id = nextId++;
  return new Promise<unknown>((resolve, reject) => {
    const onMsg = (data: WebSocket.RawData) => {
      const msg = JSON.parse(String(data));
      if (msg.id !== id) return;
      ws.off("message", onMsg);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    };
    ws.on("message", onMsg);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

const result = (await send("Target.getTargets")) as {
  targetInfos?: Array<{
    targetId: string;
    type: string;
    title: string;
    url: string;
    attached?: boolean;
  }>;
};

const infos = result.targetInfos || [];
console.log("count", infos.length);
for (const t of infos) {
  console.log(
    JSON.stringify({
      type: t.type,
      title: (t.title || "").slice(0, 70),
      url: (t.url || "").slice(0, 100),
      attached: t.attached,
    }),
  );
}

ws.close();
