export type NtfyPayload = {
  title: string;
  body: string;
  /** ntfy priority 1–5 (5 = max) */
  priority?: number;
  tags?: string[];
  /** Opens this URL when the notification is tapped */
  clickUrl?: string;
};

/**
 * Publish a notification to a self-hosted or public ntfy topic.
 * No-ops when NTFY_URL / NTFY_TOPIC are unset.
 */
export async function publishNtfy(
  baseUrl: string | undefined,
  topic: string | undefined,
  payload: NtfyPayload,
): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const root = (baseUrl || "").trim().replace(/\/$/, "");
  const t = (topic || "").trim();
  if (!root || !t) {
    return { ok: true, skipped: true };
  }

  const url = `${root}/${encodeURIComponent(t)}`;
  try {
    const headers: Record<string, string> = {
      Title: payload.title,
      Priority: String(payload.priority ?? 4),
      Tags: (payload.tags ?? ["robot", "warning"]).join(","),
      "Content-Type": "text/plain; charset=utf-8",
    };
    if (payload.clickUrl) {
      headers.Click = payload.clickUrl;
    }
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: payload.body,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        ok: false,
        error: `ntfy HTTP ${res.status}${text ? `: ${text.slice(0, 120)}` : ""}`,
      };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "ntfy publish failed",
    };
  }
}
