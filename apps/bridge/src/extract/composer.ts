import type { AgentPhase, TabInfo, TimelineItem } from "@cursormobileaccess/protocol";
import { EXTRACT_COMPOSER_UI_SOURCE } from "./composer-source.js";

export interface ExtractedUi {
  ok: boolean;
  reason?: string;
  phase: AgentPhase;
  activityText?: string;
  pendingPrompt?: string;
  mode?: string;
  model?: string;
  tabs: TabInfo[];
  timeline: TimelineItem[];
  awaiting: boolean;
  /** Agents sidebar still has a visible "More" control (overflow chats may be hidden). */
  hasMoreOverflow?: boolean;
}

export { EXTRACT_COMPOSER_UI_SOURCE };
