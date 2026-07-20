/** Semantic wire types for CursorMobileAccess. See docs/PROTOCOL.md */

export type AgentPhase =
  | "disconnected"
  | "idle"
  | "thinking"
  | "tool"
  | "awaiting_input"
  | "error";

export type AttentionReason =
  | "awaiting_input"
  | "became_idle"
  | "disconnected"
  | "error";

export type ActionKind =
  | "approve"
  | "reject"
  | "run"
  | "skip"
  | "allow"
  | "build"
  | "view_plan"
  | "answer"
  | "custom";

export interface WindowInfo {
  id: string;
  title: string;
  projectName: string;
}

export interface TabInfo {
  id: string;
  title: string;
  active: boolean;
}

export interface CodeBlock {
  language?: string;
  filename?: string;
  code: string;
}

export interface PlanTodo {
  id: string;
  text: string;
  status: "pending" | "in_progress" | "completed";
}

export interface QuestionOption {
  id: string;
  label: string;
}

export type TimelineItem =
  | {
      id: string;
      kind: "user";
      text: string;
    }
  | {
      id: string;
      kind: "assistant";
      markdown: string;
      codeBlocks?: CodeBlock[];
    }
  | {
      id: string;
      kind: "thought";
      summary?: string;
      durationSec?: number;
    }
  | {
      id: string;
      kind: "tool";
      title: string;
      detail?: string;
      status: "running" | "done" | "failed";
    }
  | {
      id: string;
      kind: "command";
      command: string;
      description?: string;
    }
  | {
      id: string;
      kind: "plan";
      title: string;
      summary?: string;
      todos: PlanTodo[];
    }
  | {
      id: string;
      kind: "question";
      prompt: string;
      options: QuestionOption[];
    };

/** Opaque action surfaced to the client — no DOM selectors. */
export interface Action {
  id: string;
  kind: ActionKind;
  label: string;
  targetItemId?: string;
  optionId?: string;
  /** True when this answer option is currently selected in Cursor (before Continue). */
  selected?: boolean;
  /** True for "Other…" style options that need freeform text. */
  freeform?: boolean;
}

export interface SessionSnapshot {
  connection: { cdp: boolean };
  windows: WindowInfo[];
  activeWindowId: string | null;
  tabs: TabInfo[];
  phase: AgentPhase;
  activityText?: string;
  /** Live AskQuestion prompt from the questionnaire tray (not yet answered). */
  pendingPrompt?: string;
  mode?: string;
  model?: string;
  timeline: TimelineItem[];
  actions: Action[];
}

export type SessionPatch = {
  [K in keyof SessionSnapshot]?: SessionSnapshot[K];
};

export type CommandPayload =
  | { op: "send_message"; text: string }
  | { op: "invoke_action"; actionId: string }
  | { op: "fill_freeform"; text: string }
  | { op: "select_window"; windowId: string }
  | { op: "select_tab"; tabId: string }
  | { op: "new_chat" }
  | { op: "set_mode"; mode: string }
  | { op: "set_model"; model: string };

/** Client → server frame. Commands are flat: `{ type, commandId, op, ... }`. */
export type ClientMessage =
  | { type: "auth"; token: string }
  | ({ type: "command"; commandId: string } & CommandPayload);

export type ServerMessage =
  | { type: "auth_ok" }
  | { type: "auth_error"; message: string }
  | { type: "snapshot"; state: SessionSnapshot }
  | { type: "patch"; patch: SessionPatch }
  | { type: "command_result"; commandId: string; ok: boolean; error?: string }
  | {
      type: "attention";
      reason: AttentionReason;
      title: string;
      body: string;
    };

export function emptySnapshot(): SessionSnapshot {
  return {
    connection: { cdp: false },
    windows: [],
    activeWindowId: null,
    tabs: [],
    phase: "disconnected",
    timeline: [],
    actions: [],
  };
}
