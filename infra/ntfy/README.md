# Self-hosted ntfy (optional)

Push notifications when the agent needs you or goes idle. The bridge POSTs to ntfy; the phone app subscribes to a **secret topic**.

## Setup

1. Pick a random topic name (e.g. `cursor-` + 12 random chars). Save it in `topic.txt` (gitignored):

   ```powershell
   $topic = "cursor-" + (-join ((48..57)+(97..122) | Get-Random -Count 12 | ForEach-Object { [char]$_ }))
   Set-Content -Path infra/ntfy/topic.txt -Value $topic -NoNewline
   Write-Host "NTFY_TOPIC=$topic"
   ```

2. Copy `infra/ntfy/.env.example` → `infra/ntfy/.env` and set `NTFY_BASE_URL` to your Tailscale-reachable URL (e.g. `http://100.x.x.x:2586` or MagicDNS).

3. Start the container:

   ```powershell
   docker compose -f infra/ntfy/docker-compose.yml up -d
   ```

4. Add to repo root `.env`:

   ```env
   NTFY_URL=http://127.0.0.1:2586
   NTFY_TOPIC=<contents of topic.txt>
   BRIDGE_PUBLIC_URL=http://<tailscale-ip-or-dns>:8787
   ```

5. **Phone (ntfy app):** Add server = your `NTFY_BASE_URL`, subscribe to the same topic. Tapping a notification opens `BRIDGE_PUBLIC_URL`.

## Commands

```powershell
docker compose -f infra/ntfy/docker-compose.yml up -d
docker compose -f infra/ntfy/docker-compose.yml down
docker ps --filter name=cursormobile-ntfy
```

Test publish (replace `$topic`):

```powershell
curl.exe -sS -d "test" -H "Title: ntfy online" "http://127.0.0.1:2586/$topic"
```
