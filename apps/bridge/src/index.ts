import { loadConfig } from "./config.js";
import { startBridgeServer } from "./server.js";

const config = loadConfig();
if (config.authToken === "dev-change-me") {
  console.warn("[bridge] Using default BRIDGE_AUTH_TOKEN=dev-change-me — set a real secret before Tailscale exposure.");
}
if (config.ntfyUrl && config.ntfyTopic) {
  console.log(`[bridge] ntfy → ${config.ntfyUrl}/${config.ntfyTopic}`);
  if (config.publicUrl) {
    console.log(`[bridge] ntfy tap opens ${config.publicUrl}`);
  }
} else {
  console.log("[bridge] ntfy disabled (set NTFY_URL + NTFY_TOPIC to enable)");
}

startBridgeServer(config);
