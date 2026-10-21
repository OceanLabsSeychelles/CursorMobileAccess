import type {
  SessionSnapshot,
  WindowInfo,
  TabInfo,
  AttachFile,
} from "@cursormobileaccess/protocol";
import { emptySnapshot } from "@cursormobileaccess/protocol";
import { CdpClient } from "../cdp/client.js";
import {
  discoverWindows,
  type CdpTarget,
  isWorkbenchTarget,
} from "../cdp/discover.js";
import { EXTRACT_COMPOSER_UI_SOURCE, type ExtractedUi } from "./composer.js";
import {
  sendComposerMessage,
  type CommandResult,
} from "../commands/send-message.js";
import { fillQuestionnaireFreeform } from "../commands/fill-freeform.js";
import { selectAgentChat } from "../commands/select-tab.js";
import { expandAgentsMore } from "../commands/expand-agents-more.js";
import { attachComposerFiles } from "../commands/attach-files.js";
import { ActionRegistry } from "./action-registry.js";

/** How often we may click Agents "More" during background polling (never collapse). */
const MORE_EXPAND_COOLDOWN_MS = 10 * 60 * 1000;
const MAX_REMEMBERED_TABS = 100;

export type PollResult = {
  snapshot: SessionSnapshot;
  attention?: {
    reason: "awaiting_input" | "became_idle" | "disconnected" | "error";
    title: string;
    body: string;
  };
};

export class ComposerMonitor {
  private client: CdpClient | null = null;
  private activeTargetId: string | null = null;
  private targets: CdpTarget[] = [];
  private windows: WindowInfo[] = [];
  private lastPhase: SessionSnapshot["phase"] = "disconnected";
  private lastTabs: TabInfo[] = [];
  /** Consecutive polls that returned no usable chat tabs. */
  private tabsEmptyStreak = 0;
  /** Last time we clicked Agents sidebar "More" (0 = never). */
  private lastMoreExpandAt = 0;
  private readonly actions = new ActionRegistry();
  /** Serialize CDP use — poll + commands must not overlap. */
  private tail: Promise<unknown> = Promise.resolve();

  constructor(private readonly cdpHttpUrl: string) {}

  private runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.tail.then(fn, fn);
    this.tail = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  async refreshTargets(): Promise<WindowInfo[]> {
    const { windows, targets } = await discoverWindows(this.cdpHttpUrl);
    this.windows = windows;
    this.targets = targets.filter(isWorkbenchTarget);
    return windows;
  }

  async ensureConnected(preferredWindowId?: string | null): Promise<boolean> {
    await this.refreshTargets();
    if (!this.targets.length) {
      await this.detach();
      return false;
    }

    const preferred =
      (preferredWindowId &&
        this.targets.find((t) => t.id === preferredWindowId)) ||
      this.targets.find((t) => t.id === this.activeTargetId) ||
      this.targets[0]!;

    if (
      this.client?.isConnected() &&
      this.activeTargetId === preferred.id &&
      preferred.webSocketDebuggerUrl
    ) {
      return true;
    }

    await this.detach();
    if (!preferred.webSocketDebuggerUrl) {
      return false;
    }

    try {
      this.client = new CdpClient(preferred.webSocketDebuggerUrl);
      await this.client.connect();
      this.activeTargetId = preferred.id;
      return true;
    } catch {
      await this.detach();
      return false;
    }
  }

  async poll(preferredWindowId?: string | null): Promise<PollResult> {
    return this.runExclusive(() => this.pollInner(preferredWindowId));
  }

  private async pollInner(
    preferredWindowId?: string | null,
  ): Promise<PollResult> {
    const base = emptySnapshot();
    base.windows = this.windows.length
      ? this.windows
      : await this.refreshTargets();

    try {
      const connected = await this.ensureConnected(preferredWindowId);
      if (!connected || !this.client) {
        const snap: SessionSnapshot = {
          ...base,
          connection: { cdp: false },
          activeWindowId: null,
          phase: "disconnected",
          activityText: "No Cursor workbench target — is CDP enabled?",
          timeline: [],
          actions: [],
        };
        const attention =
          this.lastPhase !== "disconnected"
            ? {
                reason: "disconnected" as const,
                title: "Cursor disconnected",
                body: "Lost CDP workbench target",
              }
            : undefined;
        this.lastPhase = "disconnected";
        return { snapshot: snap, attention };
      }

      let extracted = await this.client.evaluate<ExtractedUi>(
        EXTRACT_COMPOSER_UI_SOURCE,
      );
      let expandedMore = false;
      if (
        extracted?.ok &&
        extracted.hasMoreOverflow &&
        this.shouldExpandMore(extracted.tabs.length)
      ) {
        const expand = await expandAgentsMore(this.client);
        if (expand.clicked) {
          expandedMore = true;
          this.lastMoreExpandAt = Date.now();
          await new Promise((r) => setTimeout(r, 450));
          extracted = await this.client.evaluate<ExtractedUi>(
            EXTRACT_COMPOSER_UI_SOURCE,
          );
          console.log(
            `[bridge] expanded Agents "More" — tabs ${extracted?.tabs?.length ?? 0}`,
          );
        }
      }
      const actionList = await this.actions.refresh(this.client);

      if (!extracted.ok) {
        const snap: SessionSnapshot = {
          ...base,
          connection: { cdp: true },
          activeWindowId: this.activeTargetId,
          phase: "error",
          activityText: extracted.reason ?? "Extract failed",
          // Keep last known chats so the switcher does not vanish on a bad poll.
          tabs: this.lastTabs,
          timeline: [],
          actions: actionList,
        };
        const attention =
          this.lastPhase !== "error"
            ? {
                reason: "error" as const,
                title: "UI extract failed",
                body: extracted.reason ?? "Unknown",
              }
            : undefined;
        this.lastPhase = "error";
        return { snapshot: snap, attention };
      }

      let phase = extracted.phase;
      let activityText = extracted.activityText;
      if (actionList.length > 0 && phase !== "thinking") {
        phase = "awaiting_input";
        activityText =
          extracted.pendingPrompt ??
          activityText ??
          `${actionList.length} action(s) pending`;
      }

      const tabs = this.mergeTabs(extracted.tabs, {
        authoritative: expandedMore,
      });

      const snap: SessionSnapshot = {
        ...base,
        connection: { cdp: true },
        activeWindowId: this.activeTargetId,
        tabs,
        phase,
        activityText,
        pendingPrompt: extracted.pendingPrompt,
        mode: extracted.mode,
        model: extracted.model,
        timeline: extracted.timeline,
        actions: actionList,
      };

      let attention: PollResult["attention"];
      if (phase === "awaiting_input" && this.lastPhase !== "awaiting_input") {
        attention = {
          reason: "awaiting_input",
          title: "Cursor needs you",
          body: activityText ?? "Approval or input required",
        };
      } else if (
        phase === "idle" &&
        this.lastPhase !== "idle" &&
        this.lastPhase !== "disconnected"
      ) {
        attention = {
          reason: "became_idle",
          title: "Cursor finished",
          body: "Agent is idle",
        };
      }

      this.lastPhase = phase;
      return { snapshot: snap, attention };
    } catch (err) {
      await this.detach();
      const message = err instanceof Error ? err.message : "poll failed";
      const attention =
        this.lastPhase !== "error"
          ? {
              reason: "error" as const,
              title: "CDP error",
              body: message,
            }
          : undefined;
      this.lastPhase = "error";
      return {
        snapshot: {
          ...base,
          connection: { cdp: false },
          phase: "error",
          activityText: message,
          timeline: [],
          actions: [],
        },
        attention,
      };
    }
  }

  async detach(): Promise<void> {
    this.client?.close();
    this.client = null;
    this.activeTargetId = null;
  }

  async sendMessage(
    text: string,
    preferredWindowId?: string | null,
  ): Promise<CommandResult> {
    return this.runExclusive(async () => {
      const connected = await this.ensureConnected(preferredWindowId);
      if (!connected || !this.client) {
        return {
          ok: false,
          error:
            "CDP not connected — launch Cursor with --remote-debugging-port=9222",
        };
      }
      return sendComposerMessage(this.client, text);
    });
  }

  async invokeAction(
    actionId: string,
    preferredWindowId?: string | null,
  ): Promise<CommandResult> {
    return this.runExclusive(async () => {
      const connected = await this.ensureConnected(preferredWindowId);
      if (!connected || !this.client) {
        return { ok: false, error: "CDP not connected" };
      }
      return this.actions.invoke(this.client, actionId);
    });
  }

  async fillFreeform(
    text: string,
    preferredWindowId?: string | null,
  ): Promise<CommandResult> {
    return this.runExclusive(async () => {
      const connected = await this.ensureConnected(preferredWindowId);
      if (!connected || !this.client) {
        return { ok: false, error: "CDP not connected" };
      }
      return fillQuestionnaireFreeform(this.client, text);
    });
  }

  async attachFiles(
    files: AttachFile[],
    opts: { text?: string; submit?: boolean } = {},
    preferredWindowId?: string | null,
  ): Promise<CommandResult> {
    return this.runExclusive(async () => {
      const connected = await this.ensureConnected(preferredWindowId);
      if (!connected || !this.client) {
        return { ok: false, error: "CDP not connected" };
      }
      return attachComposerFiles(this.client, files, opts);
    });
  }

  async selectTab(
    tabId: string,
    preferredWindowId?: string | null,
  ): Promise<CommandResult> {
    return this.runExclusive(async () => {
      const connected = await this.ensureConnected(preferredWindowId);
      if (!connected || !this.client) {
        return { ok: false, error: "CDP not connected" };
      }
      // Prefer resolving title from last snapshot tabs by id
      const tab = this.lastTabs.find((t) => t.id === tabId);
      let title = (tab?.title || "").trim();
      if (!title && tabId.startsWith("chat-")) {
        try {
          title = decodeURIComponent(tabId.slice("chat-".length)).trim();
        } catch {
          title = tabId.slice("chat-".length).trim();
        }
      }
      if (!title) {
        title = tabId.trim();
      }
      if (!title || title === "chat-") {
        return {
          ok: false,
          error: "Chat title missing — reopen the Agents sidebar in Cursor",
        };
      }
      let result = await selectAgentChat(this.client, title);
      if (!result.ok) {
        // Chat may sit behind Agents "More" — expand once (leave open), retry.
        const expand = await expandAgentsMore(this.client);
        if (expand.clicked) {
          this.lastMoreExpandAt = Date.now();
          await new Promise((r) => setTimeout(r, 450));
          const extracted = await this.client.evaluate<ExtractedUi>(
            EXTRACT_COMPOSER_UI_SOURCE,
          );
          if (extracted?.ok) {
            this.mergeTabs(extracted.tabs, { authoritative: true });
          }
          result = await selectAgentChat(this.client, title);
        }
      }
      return result;
    });
  }

  /** Expand More on first sighting or after cooldown — never collapse. */
  private shouldExpandMore(_extractedTabCount: number): boolean {
    if (this.lastMoreExpandAt === 0) return true;
    return Date.now() - this.lastMoreExpandAt >= MORE_EXPAND_COOLDOWN_MS;
  }

  /**
   * Keep the last good chat list when Cursor briefly unmounts/collapses the
   * Agents sidebar (otherwise both phone + web hide the switcher).
   * Union-merge with prior tabs so "More"-overflow chats stay listed between
   * rare expands. Authoritative refreshes (after expanding More) prune stale names.
   */
  private mergeTabs(
    extracted: TabInfo[],
    opts: { authoritative?: boolean } = {},
  ): TabInfo[] {
    const next = extracted.filter((t) => (t.title || "").trim().length > 0);
    if (next.length === 0) {
      this.tabsEmptyStreak += 1;
      if (this.lastTabs.length > 0 && this.tabsEmptyStreak < 8) {
        return this.lastTabs.map((t) => ({ ...t }));
      }
      if (this.tabsEmptyStreak >= 8) {
        this.lastTabs = [];
      }
      return [];
    }

    this.tabsEmptyStreak = 0;

    if (opts.authoritative) {
      this.lastTabs = next;
      return next.map((t) => ({ ...t }));
    }

    const byKey = new Map<string, TabInfo>();
    for (const t of this.lastTabs) {
      byKey.set(t.title.toLowerCase(), { ...t, active: false });
    }
    for (const t of next) {
      byKey.set(t.title.toLowerCase(), { ...t });
    }
    let merged = [...byKey.values()];
    if (merged.length > MAX_REMEMBERED_TABS) {
      // Prefer tabs seen in this extract, then fill from memory
      const freshKeys = new Set(next.map((t) => t.title.toLowerCase()));
      const fresh = merged.filter((t) => freshKeys.has(t.title.toLowerCase()));
      const remembered = merged.filter(
        (t) => !freshKeys.has(t.title.toLowerCase()),
      );
      merged = [
        ...fresh,
        ...remembered.slice(0, Math.max(0, MAX_REMEMBERED_TABS - fresh.length)),
      ];
    }
    if (!merged.some((t) => t.active) && merged.length > 0) {
      const prefer = next.find((t) => t.active)?.title.toLowerCase();
      const hit = prefer
        ? merged.find((t) => t.title.toLowerCase() === prefer)
        : undefined;
      (hit ?? merged[0]!).active = true;
    }
    this.lastTabs = merged;
    return merged.map((t) => ({ ...t }));
  }

  getActiveWindowId(): string | null {
    return this.activeTargetId;
  }
}
