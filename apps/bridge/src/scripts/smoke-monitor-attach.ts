import { loadConfig } from "../config.js";
import { ComposerMonitor } from "../extract/monitor.js";

const config = loadConfig();
const monitor = new ComposerMonitor(config.cdpHttpUrl);
const windows = await monitor.refreshTargets();
console.log("windows", windows.length);
const connected = await monitor.ensureConnected(null);
console.log("connected", connected);
if (connected) {
  const result = await monitor.attachFiles(
    [
      {
        name: "smoke.png",
        mime: "image/png",
        dataBase64:
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      },
    ],
    { submit: false },
  );
  console.log("attach", result);
}
process.exit(connected ? 0 : 1);
