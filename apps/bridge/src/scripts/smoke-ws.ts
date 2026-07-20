/**
 * Smoke-test bridge WebSocket: auth + snapshot (no send_message).
 */
import { WebSocket } from "ws";

const url = process.env.BRIDGE_URL ?? "ws://127.0.0.1:8787";
const token = process.env.BRIDGE_AUTH_TOKEN ?? "dev-change-me";

const ws = new WebSocket(url);
const timeout = setTimeout(() => {
  console.error("TIMEOUT waiting for snapshot");
  ws.close();
  process.exit(1);
}, 15_000);

ws.on("open", () => {
  console.log("connected", url);
  ws.send(JSON.stringify({ type: "auth", token }));
});

ws.on("message", (raw) => {
  const msg = JSON.parse(String(raw)) as {
    type: string;
    message?: string;
    state?: {
      phase: string;
      connection: { cdp: boolean };
      timeline: unknown[];
      windows: Array<{ projectName: string }>;
      activityText?: string;
    };
    patch?: unknown;
  };

  if (msg.type === "auth_error") {
    console.error("auth_error", msg.message);
    clearTimeout(timeout);
    process.exit(1);
  }
  if (msg.type === "auth_ok") {
    console.log("auth_ok");
    return;
  }
  if (msg.type === "snapshot" && msg.state) {
    const s = msg.state;
    console.log(
      JSON.stringify(
        {
          cdp: s.connection.cdp,
          phase: s.phase,
          activityText: s.activityText,
          windows: s.windows.map((w) => w.projectName),
          timelineCount: s.timeline.length,
        },
        null,
        2,
      ),
    );
    clearTimeout(timeout);
    ws.close();
    process.exit(s.connection.cdp ? 0 : 2);
  }
});

ws.on("error", (err) => {
  console.error("ws error", err.message);
  clearTimeout(timeout);
  process.exit(1);
});
