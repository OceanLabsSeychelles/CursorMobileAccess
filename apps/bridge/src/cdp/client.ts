type CdpResponse = {
  id: number;
  result?: unknown;
  error?: { message: string; code?: number };
};

type Pending = {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
};

/** Minimal CDP client over the page target WebSocket (no Puppeteer). */
export class CdpClient {
  private ws: WebSocket | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();

  constructor(private readonly wsUrl: string) {}

  /** True when the underlying WebSocket is open. */
  isConnected(): boolean {
    return this.ws != null && this.ws.readyState === WebSocket.OPEN;
  }

  async connect(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return;

    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(this.wsUrl);
      this.ws = ws;

      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error(`CDP WebSocket error: ${this.wsUrl}`));
      ws.onclose = () => {
        for (const [, p] of this.pending) {
          p.reject(new Error("CDP WebSocket closed"));
        }
        this.pending.clear();
      };
      ws.onmessage = (ev) => {
        let msg: CdpResponse;
        try {
          msg = JSON.parse(String(ev.data)) as CdpResponse;
        } catch {
          return;
        }
        if (msg.id == null) return;
        const pending = this.pending.get(msg.id);
        if (!pending) return;
        this.pending.delete(msg.id);
        if (msg.error) {
          pending.reject(new Error(msg.error.message));
        } else {
          pending.resolve(msg.result);
        }
      };
    });
  }

  async send(method: string, params?: Record<string, unknown>): Promise<unknown> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("CDP not connected");
    }
    const id = this.nextId++;
    const payload = JSON.stringify({ id, method, params });
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws!.send(payload);
    });
  }

  async evaluate<T>(expression: string): Promise<T> {
    const result = (await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })) as {
      result?: { value?: T; subtype?: string; description?: string };
      exceptionDetails?: {
        text?: string;
        exception?: { description?: string };
      };
    };

    if (result.exceptionDetails) {
      const detail =
        result.exceptionDetails.exception?.description ||
        result.exceptionDetails.text ||
        "Runtime.evaluate failed";
      throw new Error(detail);
    }
    return result.result?.value as T;
  }

  async insertText(text: string): Promise<void> {
    await this.send("Input.insertText", { text });
  }

  /** Best-effort focus of the Electron page target before Input events. */
  async bringToFront(): Promise<void> {
    try {
      await this.send("Page.bringToFront");
    } catch {
      // optional
    }
  }

  async keyDown(key: string, mods: KeyMods = {}): Promise<void> {
    await this.send("Input.dispatchKeyEvent", {
      type: "keyDown",
      key,
      code: keyCode(key),
      windowsVirtualKeyCode: virtualKey(key),
      nativeVirtualKeyCode: virtualKey(key),
      modifiers: modifierMask(mods),
      ...textFields(key, "keyDown"),
    });
  }

  async keyUp(key: string, mods: KeyMods = {}): Promise<void> {
    await this.send("Input.dispatchKeyEvent", {
      type: "keyUp",
      key,
      code: keyCode(key),
      windowsVirtualKeyCode: virtualKey(key),
      nativeVirtualKeyCode: virtualKey(key),
      modifiers: modifierMask(mods),
    });
  }

  close(): void {
    this.ws?.close();
    this.ws = null;
  }
}

type KeyMods = {
  ctrlKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
};

function modifierMask(mods: KeyMods): number {
  let m = 0;
  if (mods.altKey) m |= 1;
  if (mods.ctrlKey) m |= 2;
  if (mods.metaKey) m |= 4;
  if (mods.shiftKey) m |= 8;
  return m;
}

function keyCode(key: string): string {
  if (key === "Enter") return "Enter";
  if (key === "Backspace") return "Backspace";
  if (key.length === 1) return `Key${key.toUpperCase()}`;
  return key;
}

function virtualKey(key: string): number {
  if (key === "Enter") return 13;
  if (key === "Backspace") return 8;
  if (key.length === 1) return key.toUpperCase().charCodeAt(0);
  return 0;
}

function textFields(
  key: string,
  type: "keyDown" | "keyUp",
): Record<string, string> {
  if (type === "keyDown" && key === "Enter") return { text: "\r" };
  return {};
}
