import { loadConfig } from "../config.js";
import { isWorkbenchTarget, listCdpTargets } from "../cdp/discover.js";
import { CdpClient } from "../cdp/client.js";
import { EXTRACT_COMPOSER_UI_SOURCE } from "../extract/composer-source.js";
import { EXTRACT_ACTIONS_SOURCE } from "../extract/actions-source.js";

const config = loadConfig();
const targets = (await listCdpTargets(config.cdpHttpUrl)).filter(isWorkbenchTarget);
const client = new CdpClient(targets[0]!.webSocketDebuggerUrl!);
await client.connect();

const ui = await client.evaluate(EXTRACT_COMPOSER_UI_SOURCE);
const actions = await client.evaluate(EXTRACT_ACTIONS_SOURCE);

const last = (ui.timeline || []).slice(-8).map((t) => ({
  kind: t.kind,
  preview: (
    t.text ||
    t.markdown ||
    t.title ||
    t.prompt ||
    t.summary ||
    t.detail ||
    ""
  )
    .toString()
    .slice(0, 120),
  status: t.status,
}));

console.log(
  JSON.stringify(
    {
      phase: ui.phase,
      activityText: ui.activityText,
      timelineCount: ui.timeline?.length,
      lastTimeline: last,
      actionCount: actions.actions?.length ?? 0,
      actions: actions.actions ?? [],
    },
    null,
    2,
  ),
);
client.close();
