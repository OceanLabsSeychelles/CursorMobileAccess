import type { WindowInfo } from "@cursormobileaccess/protocol";

export interface CdpTarget {
  id: string;
  title: string;
  type: string;
  url: string;
  webSocketDebuggerUrl?: string;
}

/** Fetch Cursor/Electron page targets from the CDP HTTP endpoint. */
export async function listCdpTargets(cdpHttpUrl: string): Promise<CdpTarget[]> {
  const res = await fetch(`${cdpHttpUrl.replace(/\/$/, "")}/json`);
  if (!res.ok) {
    throw new Error(`CDP /json failed: HTTP ${res.status}`);
  }
  return (await res.json()) as CdpTarget[];
}

export function isWorkbenchTarget(target: CdpTarget): boolean {
  return target.type === "page" && /workbench/i.test(target.url);
}

/** Map CDP targets to protocol WindowInfo (title heuristics only for now). */
export function targetsToWindows(targets: CdpTarget[]): WindowInfo[] {
  return targets.filter(isWorkbenchTarget).map((t) => {
    const title = t.title.replace(/\s*-\s*Cursor\s*$/i, "").trim() || t.title;
    const projectName = title.split(" - ").at(-1)?.trim() || title;
    return {
      id: t.id,
      title,
      projectName,
    };
  });
}

export async function discoverWindows(cdpHttpUrl: string): Promise<{
  windows: WindowInfo[];
  targets: CdpTarget[];
}> {
  const targets = await listCdpTargets(cdpHttpUrl);
  return { windows: targetsToWindows(targets), targets };
}
