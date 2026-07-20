# Setup guide

End-to-end walkthrough for CursorMobileAccess on a Windows PC (bridge host) and a phone on the same Tailscale network.

## 1. Tailscale

Install [Tailscale](https://tailscale.com/) on the PC and phone. Note the PC’s Tailscale IP (`100.x.x.x`) or MagicDNS name (`your-machine.tailnet.ts.net`).

The bridge will bind to the Tailscale IP so the phone can reach it without opening ports on your router.

## 2. Cursor with CDP

Cursor must be launched with remote debugging. **Fully exit Cursor first** — a second launch with flags is ignored while an instance is running.

```powershell
cd C:\path\to\CursorMobileAccess
.\scripts\start-cursor-cdp.ps1
```

Confirm CDP is up: open [http://127.0.0.1:9222/json](http://127.0.0.1:9222/json). You should see a `page` target titled **Cursor Agents**.

Open the **Agents Window** and the chat you want to control from the phone.

## 3. Bridge configuration

```powershell
Copy-Item .env.example .env
```

Edit `.env` (this file is gitignored):

| Variable | Purpose |
| --- | --- |
| `BRIDGE_AUTH_TOKEN` | Shared secret — phone must send this on WebSocket `auth`. Use a long random string. |
| `BRIDGE_HOST` | Tailscale IP of this PC, or `127.0.0.1` for local-only testing |
| `BRIDGE_PORT` | Default `8787` |
| `CDP_URL` | Default `http://127.0.0.1:9222` |
| `NTFY_URL` / `NTFY_TOPIC` | Optional — see [ntfy](#5-ntfy-optional) |
| `BRIDGE_PUBLIC_URL` | Optional — URL opened when tapping ntfy (defaults from host/port) |

Generate a token (PowerShell):

```powershell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }) -as [byte[]])
```

## 4. Run the bridge

```powershell
npm install
npm run bridge
```

This builds `apps/web` and starts the bridge. Logs should show CDP connected and the bind URL.

On the phone, open:

`http://<BRIDGE_HOST>:8787`

Enter the same `BRIDGE_AUTH_TOKEN`. The token is stored in browser local storage.

### What you should see

- **Timeline** — messages and tool activity from the **focused** Agents chat
- **Needs your action** — Skip / Always Run / Run / question chips when Cursor is waiting
- **Composer** — send follows-up messages (uses the Send button in Cursor, not Enter)

### Switch chats

Use the **tab chips** at the top of the phone UI to `select_tab` in the Agents sidebar. The bridge mirrors whichever chat is focused in Cursor.

## 5. ntfy (optional)

Push notifications when the agent needs input or goes idle.

1. Follow [infra/ntfy/README.md](../infra/ntfy/README.md).
2. Add `NTFY_URL`, `NTFY_TOPIC`, and `BRIDGE_PUBLIC_URL` to `.env`.
3. Restart the bridge.

On the phone, install the [ntfy app](https://ntfy.sh/), add your server URL, subscribe to the secret topic.

## 6. Permissions (Skip / Always Run / Run)

When Cursor **Auto-review** blocks a shell/network tool, the desktop shows **Skip**, **Always Run**, and **Run**. The bridge extracts these as action chips on the phone.

**Important:**

- Phone **Send** does **not** press Enter in Cursor (Enter would trigger **Run** while a permission bar is open).
- Use the phone chips to approve — or handle permissions on desktop.
- The bridge only sees the **Agents Window** CDP target. Keep the chat you care about focused there.

If chips are missing but you see Skip/Run as plain timeline text, hard-refresh the phone page and confirm the correct chat is active in Agents.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| `CDP not connected` | Cursor running with `--remote-debugging-port=9222`? `/json` reachable? |
| Wrong chat on phone | Focus the desired chat in Agents; use tab chips to switch |
| `Invalid token` | `.env` token matches phone; bridge restarted after `.env` change |
| No action chips | Permission bar must be open in Agents; not just text pasted in chat history |
| Send approved a prompt | Update bridge — send must click **Send message**, never Enter |
| ntfy not received | Docker container up? `NTFY_TOPIC` matches phone subscription? |
| Stale token after edit | Bridge loads repo `.env` over old shell env — restart bridge |

### Dev probes

CDP debug scripts live under `apps/bridge/src/scripts/` (e.g. `probe-gate.ts`, `focus-cma-chat.ts`). Run with `npx tsx apps/bridge/src/scripts/<name>.ts`.

## Files you must not commit

| File | Contains |
| --- | --- |
| `.env` | Auth token, Tailscale host, ntfy topic |
| `infra/ntfy/topic.txt` | ntfy topic name |
| `infra/ntfy/.env` | Public ntfy URL |
| `tmp-*.json`, probe dumps | May include chat snippets |

These paths are in `.gitignore`. Use `.env.example` and `infra/ntfy/.env.example` as templates only.
