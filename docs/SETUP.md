# Setup guide

End-to-end walkthrough for CursorMobileAccess on a Windows PC (bridge host) and a phone on the same Tailscale network.

## 1. Tailscale

Install [Tailscale](https://tailscale.com/) on the PC and phone. Note the PC’s Tailscale IP (`100.x.x.x`) or MagicDNS name (`your-machine.tailnet.ts.net`).

The bridge will bind to the Tailscale IP so the phone can reach it without opening ports on your router.

## 2. Bridge configuration (once)

```powershell
Copy-Item .env.example .env
npm install
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

## 3. Start everything (daily / after reboot)

One script starts optional ntfy, Cursor with CDP, and the bridge console:

```powershell
cd C:\path\to\CursorMobileAccess
.\scripts\start-all.cmd -ForceCursor
```

Use the `.cmd` wrapper (not `.ps1`) when PowerShell says the script is not digitally signed — this machine’s policy is `AllSigned`. The `.cmd` files start PowerShell with `-ExecutionPolicy Bypass` for these scripts only.

`-ForceCursor` quits a Cursor instance that was restored **without** CDP (common after reboot) and relaunches with `--remote-debugging-port=9222`.

Confirm CDP: [http://127.0.0.1:9222/json](http://127.0.0.1:9222/json) — you should see a `page` target titled **Cursor Agents**. Open the **Agents Window** and focus the chat you want on the phone.

### Auto-start at Windows logon

```powershell
.\scripts\install-startup.cmd
```

This registers a scheduled task that waits briefly (Docker/Tailscale), then runs `start-all.ps1 -ForceCursor` with Bypass. Remove with `.\scripts\uninstall-startup.cmd`.

Also enable **Docker Desktop → Start when you log in** if you use ntfy.

### Keep the bridge alive (recommended)

Logon start alone is not enough — if the bridge process exits later (Cursor restart, agent terminal cleanup, Tailscale flap), nothing brings it back.

```powershell
.\scripts\install-bridge-watchdog.cmd
```

Registers **CursorMobileAccessBridgeWatchdog**, which every 2 minutes checks `http://BRIDGE_HOST:PORT/` and restarts the bridge if it is down (via a silent VBScript launcher so it does not flash a console). Remove with `.\scripts\uninstall-bridge-watchdog.cmd`.

Prefer starting the bridge via `.\scripts\start-all.cmd` or the watchdog (hidden process + `logs/bridge.log`), **not** from a Cursor agent terminal — those sessions can be killed when Cursor restarts.

### Manual pieces (if you prefer)

```powershell
.\scripts\start-cursor-cdp.cmd -Force   # Cursor only
npm run bridge                          # bridge only (foreground)
```

## 4. Phone

### Browser

On the phone, open:

`http://<BRIDGE_HOST>:8787`

Enter the same `BRIDGE_AUTH_TOKEN`. The token is stored in browser local storage.

### Android app

Native client with the same protocol as the web UI (`apps/android`). Build and install:

```powershell
cd apps\android
.\gradlew.bat installDebug
```

In the app, enter the bridge host (`<BRIDGE_HOST>:8787` or MagicDNS) and the same auth token. See [apps/android/README.md](../apps/android/README.md).

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
| `CDP not connected` | Cursor running with `--remote-debugging-port=9222`? `/json` reachable? Try `.\scripts\start-cursor-cdp.cmd -Force` |
| Script not digitally signed | Use `.\scripts\start-all.cmd` (Bypass for these scripts only), or set CurrentUser policy to RemoteSigned |
| Startup after reboot incomplete | Docker Desktop set to start at login? Wait for the scheduled task delay; re-run `.\scripts\start-all.cmd -ForceCursor` |
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
