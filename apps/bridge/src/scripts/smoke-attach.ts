/**
 * Smoke-test attach_files command (does not submit to Cursor by default).
 */
import { WebSocket } from "ws";
import { loadConfig } from "../config.js";

const config = loadConfig();
const url = process.env.BRIDGE_URL ?? `ws://${config.bindHost}:${config.bindPort}`;
const token = config.authToken;
const submit = process.argv.includes("--submit");

const ws = new WebSocket(url);
const timeout = setTimeout(() => {
  console.error("TIMEOUT");
  ws.close();
  process.exit(1);
}, 15_000);

ws.on("open", () => {
  ws.send(JSON.stringify({ type: "auth", token }));
});

ws.on("message", (raw) => {
  const msg = JSON.parse(String(raw)) as {
    type: string;
    message?: string;
    ok?: boolean;
    error?: string;
    commandId?: string;
  };
  if (msg.type === "auth_error") {
    console.error("auth_error", msg.message);
    clearTimeout(timeout);
    process.exit(1);
  }
  if (msg.type === "auth_ok") {
    ws.send(
      JSON.stringify({
        type: "command",
        commandId: "smoke-attach",
        op: "attach_files",
        files: [
          {
            name: "smoke.png",
            mime: "image/png",
            // 1x1 PNG
            dataBase64:
              "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
          },
        ],
        submit,
      }),
    );
    return;
  }
  if (msg.type === "command_result" && msg.commandId === "smoke-attach") {
    console.log(JSON.stringify(msg, null, 2));
    clearTimeout(timeout);
    ws.close();
    process.exit(msg.ok ? 0 : 1);
  }
});

ws.on("error", (err) => {
  console.error("ws error", err.message);
  clearTimeout(timeout);
  process.exit(1);
});
