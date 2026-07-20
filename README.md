# CursorMobileAccess

Control the **active Cursor Agents Window chat** from your phone over **Tailscale** — timeline, send messages, answer questions, and tap **Skip / Always Run / Run** when Auto-review is waiting.

Not a separate Cursor SDK agent: the bridge attaches to the running IDE via **Chrome DevTools Protocol (CDP)**, extracts a semantic snapshot, and serves a **web UI + WebSocket** on one port.

## How it works

```text
Cursor (Electron, --remote-debugging-port=9222)
  → Bridge (Node): CDP extract + command executor + static web UI
  → Phone browser (Tailscale): timeline, composer, action chips
  → Optional: ntfy push when agent needs attention
```

Wire format: [docs/PROTOCOL.md](docs/PROTOCOL.md). Full setup: [docs/SETUP.md](docs/SETUP.md).

## Monorepo

| Path | Role |
| --- | --- |
| `packages/protocol` | Shared TypeScript wire types |
| `apps/bridge` | CDP client, extractors, HTTP/WS server, ntfy |
| `apps/web` | Vite React phone UI (built into `apps/web/dist`) |
| `infra/ntfy` | Optional self-hosted ntfy (Docker) |
| `scripts/` | Helper scripts (e.g. launch Cursor with CDP) |

## Quick start

**Prerequisites:** Node 20+, Tailscale, Docker (optional, for ntfy).

1. **Cursor with CDP** — fully quit Cursor first (single-instance), then:

   ```powershell
   .\scripts\start-cursor-cdp.ps1
   ```

   Verify: [http://127.0.0.1:9222/json](http://127.0.0.1:9222/json)

2. **Configure** — copy `.env.example` → `.env` (gitignored), set a strong `BRIDGE_AUTH_TOKEN` and your Tailscale `BRIDGE_HOST`.

3. **Run bridge** (builds web UI, serves on one port):

   ```powershell
   npm install
   npm run bridge
   ```

4. **Phone** — open `http://<your-tailscale-ip>:8787`, enter the auth token, keep **Agents Window** focused on the chat you want to mirror.

See [docs/SETUP.md](docs/SETUP.md) for ntfy, chat switching, permissions, and troubleshooting.

## Features

| Feature | Status |
| --- | --- |
| Timeline (user / assistant / tools / thoughts) | ✅ |
| Send message (clicks Send — never Enter, so Run is not triggered) | ✅ |
| Skip / Always Run / Run / Approve chips (`invoke_action`) | ✅ |
| AskQuestion options + freeform Other | ✅ |
| Switch agent chats (`select_tab`) | ✅ |
| ntfy push + tap-to-open web UI | ✅ |
| Auth token (required on WebSocket) | ✅ |

## Security notes

- **Never commit** `.env`, `infra/ntfy/topic.txt`, or `infra/ntfy/.env` — they hold your token and ntfy topic.
- CDP stays on `127.0.0.1:9222`; only the bridge binds on Tailscale.
- Replace `dev-change-me` / example tokens before exposing the bridge on Tailscale.
- ntfy without login relies on **topic secrecy**; use a long random topic.

## License

Private / personal use unless you add a license file.
