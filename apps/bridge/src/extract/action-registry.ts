import type { Action, ActionKind } from "@cursormobileaccess/protocol";
import type { CdpClient } from "../cdp/client.js";
import {
  buildClickActionSource,
  EXTRACT_ACTIONS_SOURCE,
} from "./actions-source.js";

export type ActionLocator =
  | { by: "css"; selector: string }
  | { by: "buttonText"; text: string; index?: number }
  | { by: "aria"; label: string }
  | { by: "trayOption"; letter: string };

type StoredAction = Action & { locator: ActionLocator };

type RawExtract = {
  ok: boolean;
  actions: Array<{
    kind: ActionKind;
    label: string;
    optionId?: string;
    selected?: boolean;
    freeform?: boolean;
    locator: ActionLocator;
  }>;
};

function fingerprint(a: {
  kind: string;
  label: string;
  optionId?: string;
  locator: ActionLocator;
}): string {
  const loc =
    a.locator.by === "css"
      ? a.locator.selector
      : a.locator.by === "buttonText"
        ? `text:${a.locator.text}:${a.locator.index ?? 0}`
        : a.locator.by === "aria"
          ? `aria:${a.locator.label}`
          : `tray:${a.locator.letter}`;
  // Prefer optionId so Other… keeps a stable id when the tray expands into an input
  if (a.optionId) {
    return `${a.kind}|${a.optionId}|${loc}`;
  }
  return `${a.kind}|${a.label.replace(/\s+/g, " ").trim()}|${loc}`;
}

function stableId(fp: string): string {
  let h = 2166136261;
  for (let i = 0; i < fp.length; i++) {
    h ^= fp.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `act-${(h >>> 0).toString(36)}`;
}

/** Keeps opaque action IDs → CDP click locators for the phone client. */
export class ActionRegistry {
  private byId = new Map<string, StoredAction>();

  clear(): void {
    this.byId.clear();
  }

  async refresh(client: CdpClient): Promise<Action[]> {
    const raw = await client.evaluate<RawExtract>(EXTRACT_ACTIONS_SOURCE);
    const next = new Map<string, StoredAction>();
    if (!raw?.ok || !Array.isArray(raw.actions)) {
      this.byId = next;
      return [];
    }

    const out: Action[] = [];
    for (const a of raw.actions) {
      const fp = fingerprint(a);
      const id = stableId(fp);
      const stored: StoredAction = {
        id,
        kind: a.kind,
        label: a.label,
        optionId: a.optionId,
        selected: a.selected,
        freeform: a.freeform,
        locator: a.locator,
      };
      next.set(id, stored);
      out.push({
        id,
        kind: a.kind,
        label: a.label,
        optionId: a.optionId,
        selected: a.selected,
        freeform: a.freeform,
      });
    }
    this.byId = next;
    return out;
  }

  async invoke(
    client: CdpClient,
    actionId: string,
  ): Promise<{ ok: boolean; error?: string }> {
    const stored = this.byId.get(actionId);
    if (!stored) {
      return { ok: false, error: "Unknown or expired action id" };
    }
    await client.bringToFront();
    // Answer taps only select; user presses Continue to submit (and sees selection).
    const result = await client.evaluate<{
      ok: boolean;
      error?: string;
    }>(buildClickActionSource(stored.locator));
    return result?.ok
      ? { ok: true }
      : { ok: false, error: result?.error ?? "Click failed" };
  }
}
