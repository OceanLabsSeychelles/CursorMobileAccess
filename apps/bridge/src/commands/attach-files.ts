import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AttachFile } from "@cursormobileaccess/protocol";
import type { CdpClient } from "../cdp/client.js";
import { sendComposerMessage, type CommandResult } from "./send-message.js";

const MAX_FILES = 6;
const MAX_BYTES_EACH = 8 * 1024 * 1024;
const MAX_BYTES_TOTAL = 20 * 1024 * 1024;

const ALLOWED_MIME =
  /^(image\/(jpeg|jpg|png|gif|webp|bmp)|application\/pdf|text\/(plain|markdown|csv)|application\/(json|xml))$/i;

/**
 * Attach files to the Agents composer via the hidden <input type=file>,
 * optionally type a caption and click Send / Queue.
 */
export async function attachComposerFiles(
  client: CdpClient,
  files: AttachFile[],
  opts: { text?: string; submit?: boolean } = {},
): Promise<CommandResult> {
  if (!files.length) {
    return { ok: false, error: "No files to attach" };
  }
  if (files.length > MAX_FILES) {
    return { ok: false, error: `Too many files (max ${MAX_FILES})` };
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cma-attach-"));
  const tempPaths: string[] = [];

  try {
    let total = 0;
    for (const file of files) {
      const name = sanitizeName(file.name);
      if (!name) return { ok: false, error: "Invalid file name" };
      if (file.mime && !ALLOWED_MIME.test(file.mime) && !isAllowedExt(name)) {
        return { ok: false, error: `Unsupported type: ${file.mime || name}` };
      }
      let buf: Buffer;
      try {
        buf = Buffer.from(file.dataBase64, "base64");
      } catch {
        return { ok: false, error: `Bad base64 for ${name}` };
      }
      if (!buf.length) return { ok: false, error: `Empty file: ${name}` };
      if (buf.length > MAX_BYTES_EACH) {
        return {
          ok: false,
          error: `${name} is too large (max ${MAX_BYTES_EACH / 1024 / 1024} MiB)`,
        };
      }
      total += buf.length;
      if (total > MAX_BYTES_TOTAL) {
        return { ok: false, error: "Total attachment size too large" };
      }
      const dest = path.join(tempDir, name);
      fs.writeFileSync(dest, buf);
      tempPaths.push(dest);
    }

    await client.bringToFront();
    await sleep(80);
    await client.send("DOM.enable");

    const doc = (await client.send("DOM.getDocument", { depth: 0 })) as {
      root: { nodeId: number };
    };

    const selectors = [
      ".ui-prompt-input input[type='file']",
      ".composer-bar input[type='file']",
      "input[type='file'][accept*='image']",
      "input[type='file']",
    ];

    let nodeId = 0;
    for (const sel of selectors) {
      const q = (await client.send("DOM.querySelector", {
        nodeId: doc.root.nodeId,
        selector: sel,
      })) as { nodeId: number };
      if (q.nodeId) {
        nodeId = q.nodeId;
        break;
      }
    }

    if (!nodeId) {
      return {
        ok: false,
        error:
          "Composer file input not found — open Agents Window and focus a chat",
      };
    }

    await client.send("DOM.setFileInputFiles", {
      nodeId,
      files: tempPaths,
    });
    await sleep(500);

    const caption = opts.text?.trim() ?? "";
    const shouldSubmit = opts.submit !== false;

    if (caption) {
      return sendComposerMessage(client, caption);
    }
    if (shouldSubmit) {
      return clickComposerSubmit(client);
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    setTimeout(() => {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }, 15_000);
  }
}

async function clickComposerSubmit(client: CdpClient): Promise<CommandResult> {
  for (let attempt = 0; attempt < 16; attempt++) {
    const submit = await client.evaluate<{
      found: boolean;
      x?: number;
      y?: number;
    }>(`(() => {
      const prompt = document.querySelector(".ui-prompt-input");
      if (!prompt) return { found: false };
      const buttons = [...prompt.querySelectorAll(
        "button.ui-prompt-input-submit-button, .ui-prompt-input-submit-button"
      )];
      let best = null;
      for (const btn of buttons) {
        if (btn.disabled || btn.getAttribute("aria-disabled") === "true") continue;
        const aria = (btn.getAttribute("aria-label") || "").toLowerCase();
        if (/\\b(stop|voice|mic|dictation|run|skip)\\b/i.test(aria)) continue;
        const cls = btn.className && btn.className.toString ? btn.className.toString() : "";
        const ok =
          /\\b(send|submit|queue)\\b/i.test(aria) ||
          /ui-prompt-input-submit-button/.test(cls);
        if (!ok && aria) continue;
        const r = btn.getBoundingClientRect();
        if (r.width < 8 || r.height < 8) continue;
        best = { found: true, x: r.left + r.width / 2, y: r.top + r.height / 2 };
        if (/\\b(send|submit|queue)\\b/i.test(aria)) break;
      }
      return best || { found: false };
    })()`);

    if (submit.found && submit.x != null && submit.y != null) {
      const base = {
        x: Math.round(submit.x),
        y: Math.round(submit.y),
        button: "left" as const,
        clickCount: 1,
      };
      await client.send("Input.dispatchMouseEvent", {
        type: "mousePressed",
        ...base,
      });
      await client.send("Input.dispatchMouseEvent", {
        type: "mouseReleased",
        ...base,
      });
      return { ok: true };
    }
    await sleep(75);
  }
  return {
    ok: false,
    error:
      "Attached files but could not click Send/Queue (refusing Enter — would trigger Run)",
  };
}

function sanitizeName(name: string): string {
  const base = path.basename(name).replace(/[^\w.\- ()[\]]+/g, "_");
  return base.slice(0, 120);
}

function isAllowedExt(name: string): boolean {
  return /\.(jpe?g|png|gif|webp|bmp|pdf|md|txt|csv|json|xml|ya?ml|toml|log|docx?|xlsx?)$/i.test(
    name,
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
