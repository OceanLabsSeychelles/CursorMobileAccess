# Start everything CursorMobileAccess needs after login / reboot:
#   1) optional ntfy (Docker)
#   2) Cursor with CDP on :9222
#   3) bridge (web UI + WebSocket) in a dedicated console
#
# Usage:
#   .\scripts\start-all.cmd -ForceCursor
#   .\scripts\start-all.ps1 -ForceCursor
#   .\scripts\start-all.ps1 -SkipNtfy -SkipBridge
#
# Register at Windows logon:
#   .\scripts\install-startup.cmd

param(
  [switch]$ForceCursor,
  [switch]$SkipNtfy,
  [switch]$SkipCursor,
  [switch]$SkipBridge,
  [int]$DockerWaitSeconds = 120
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

function Write-Step([string]$Message) {
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Test-Http([string]$Url, [int]$TimeoutSec = 2) {
  try {
    $null = Invoke-RestMethod -Uri $Url -TimeoutSec $TimeoutSec
    return $true
  } catch {
    return $false
  }
}

function Get-EnvValue([string]$Key) {
  $envFile = Join-Path $Root ".env"
  if (-not (Test-Path $envFile)) { return $null }
  foreach ($line in Get-Content $envFile) {
    if ($line -match "^\s*#" -or $line -notmatch "=") { continue }
    $name, $value = $line -split "=", 2
    if ($name.Trim() -eq $Key) {
      return $value.Trim().Trim('"').Trim("'")
    }
  }
  return $null
}

# --- Preconditions ---
Write-Step "Repo $Root"

if (-not (Test-Path (Join-Path $Root ".env"))) {
  Write-Error "Missing .env - copy .env.example to .env and set BRIDGE_AUTH_TOKEN / BRIDGE_HOST first."
}

$tailscale = Get-Command tailscale -ErrorAction SilentlyContinue
if ($tailscale) {
  try {
    $ts = & tailscale status --json 2>$null | ConvertFrom-Json
    if ($ts.BackendState -eq "Running") {
      Write-Host "Tailscale: Running"
    } else {
      Write-Warning "Tailscale state: $($ts.BackendState). Phone reachability may fail until connected."
    }
  } catch {
    Write-Warning "Could not read Tailscale status (is Tailscale installed and logged in?)."
  }
} else {
  Write-Warning "tailscale CLI not on PATH - ensure Tailscale is running for phone access."
}

# --- ntfy ---
if (-not $SkipNtfy) {
  Write-Step "ntfy (Docker)"
  $compose = Join-Path $Root "infra\ntfy\docker-compose.yml"
  $docker = Get-Command docker -ErrorAction SilentlyContinue
  if (-not $docker -or -not (Test-Path $compose)) {
    Write-Host "Skipping ntfy (docker or compose file missing)."
  } else {
    $deadline = (Get-Date).AddSeconds($DockerWaitSeconds)
    $dockerReady = $false
    while ((Get-Date) -lt $deadline) {
      docker info 1>$null 2>$null
      if ($LASTEXITCODE -eq 0) {
        $dockerReady = $true
        break
      }
      Write-Host "Waiting for Docker Desktop..."
      Start-Sleep -Seconds 5
    }
    if (-not $dockerReady) {
      Write-Warning "Docker not ready after ${DockerWaitSeconds}s - skipping ntfy. Start Docker Desktop and re-run, or use -SkipNtfy."
    } else {
      $ntfyEnv = Join-Path $Root "infra\ntfy\.env"
      $envArgs = @()
      if (Test-Path $ntfyEnv) {
        $envArgs = @("--env-file", $ntfyEnv)
      }
      & docker compose -f $compose @envArgs up -d
      if ($LASTEXITCODE -ne 0) {
        Write-Warning "docker compose up failed (exit $LASTEXITCODE)."
      } else {
        Write-Host "ntfy container requested (port 2586)."
      }
    }
  }
} else {
  Write-Host "Skipping ntfy (-SkipNtfy)."
}

# --- Cursor + CDP ---
if (-not $SkipCursor) {
  Write-Step "Cursor + CDP"
  $cdpScript = Join-Path $PSScriptRoot "start-cursor-cdp.ps1"
  $cdpArgs = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $cdpScript)
  if ($ForceCursor) { $cdpArgs += "-Force" }
  & powershell.exe @cdpArgs
  if ($LASTEXITCODE -ne 0) {
    Write-Warning "CDP start failed - bridge will keep retrying once Cursor is up with CDP."
  }
} else {
  Write-Host "Skipping Cursor (-SkipCursor)."
}

# --- Bridge ---
if (-not $SkipBridge) {
  Write-Step "Bridge"
  $port = Get-EnvValue "BRIDGE_PORT"
  if (-not $port) { $port = "8787" }
  $hostName = Get-EnvValue "BRIDGE_HOST"
  if (-not $hostName) { $hostName = "127.0.0.1" }

  if (Test-Http "http://${hostName}:${port}/") {
    Write-Host "Bridge already responding on http://${hostName}:${port}/"
  } elseif ($hostName -ne "127.0.0.1" -and $hostName -ne "localhost" -and (Test-Http "http://127.0.0.1:${port}/")) {
    Write-Host "Bridge already responding on http://127.0.0.1:${port}/ (bound differently than BRIDGE_HOST)"
  } else {
    $npm = Get-Command npm -ErrorAction SilentlyContinue
    if (-not $npm) {
      Write-Error "npm not found on PATH."
    }
    $bridgeCmd = @"
Set-Location '$Root'
Write-Host 'CursorMobileAccess bridge - Ctrl+C to stop' -ForegroundColor Green
npm run start -w @cursormobileaccess/bridge
"@
    Start-Process -FilePath "powershell.exe" -ArgumentList @(
      "-NoExit",
      "-NoProfile",
      "-ExecutionPolicy", "Bypass",
      "-Command", $bridgeCmd
    ) -WindowStyle Normal
    Write-Host "Opened bridge console."
  }

  Write-Host ""
  Write-Host "Phone UI:  http://${hostName}:$port" -ForegroundColor Green
  Write-Host "Local:     http://127.0.0.1:$port"
  Write-Host "CDP:       http://127.0.0.1:9222/json"
  Write-Host ""
  Write-Host "Open Agents Window in Cursor and focus the chat you want on the phone."
} else {
  Write-Host "Skipping bridge (-SkipBridge)."
}

Write-Step "Done"
