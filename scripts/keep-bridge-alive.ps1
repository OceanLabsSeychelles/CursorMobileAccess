# Ensure the CursorMobileAccess bridge is responding. Safe to run on a timer.
# Used by the "CursorMobileAccessBridgeWatchdog" scheduled task.
#
# Usage:
#   .\scripts\keep-bridge-alive.ps1
#   .\scripts\keep-bridge-alive.ps1 -StartVisible

param(
  [switch]$StartVisible
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

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

function Test-Http([string]$Url, [int]$TimeoutSec = 2) {
  try {
    $req = [System.Net.HttpWebRequest]::Create($Url)
    $req.Method = "GET"
    $req.Timeout = $TimeoutSec * 1000
    $req.ReadWriteTimeout = $TimeoutSec * 1000
    $resp = $req.GetResponse()
    $resp.Close()
    return $true
  } catch {
    return $false
  }
}

function Test-BridgeUp([string]$HostName, [string]$Port) {
  $candidates = @(
    "http://${HostName}:${Port}/",
    "http://127.0.0.1:${Port}/"
  ) | Select-Object -Unique
  foreach ($url in $candidates) {
    if (Test-Http $url) { return $true }
  }
  return $false
}

function Get-BridgeNodePids {
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
    Where-Object {
      $_.CommandLine -and (
        $_.CommandLine -match 'CursorMobileAccess.*apps[/\\]bridge' -or
        $_.CommandLine -match '@cursormobileaccess/bridge' -or
        ($_.CommandLine -match 'tsx' -and $_.CommandLine -match 'src[/\\]index\.ts')
      )
    } |
    Select-Object -ExpandProperty ProcessId
}

$port = Get-EnvValue "BRIDGE_PORT"
if (-not $port) { $port = "8787" }
$hostName = Get-EnvValue "BRIDGE_HOST"
if (-not $hostName) { $hostName = "127.0.0.1" }

if (Test-BridgeUp $hostName $port) {
  Write-Host "[keep-bridge] OK http://${hostName}:${port}/"
  exit 0
}

Write-Warning "[keep-bridge] Bridge not responding on ${hostName}:${port} (or 127.0.0.1:${port})"

# Avoid stacking many dead shells if a start is already in flight
$existing = @(Get-BridgeNodePids)
if ($existing.Count -gt 0) {
  Write-Warning "[keep-bridge] Found node PID(s) $($existing -join ', ') but HTTP is down - restarting."
  foreach ($procId in $existing) {
    Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
  }
  Start-Sleep -Seconds 1
}

$npm = Get-Command npm -ErrorAction SilentlyContinue
if (-not $npm) {
  Write-Error "[keep-bridge] npm not on PATH"
}

$logDir = Join-Path $Root "logs"
if (-not (Test-Path $logDir)) {
  New-Item -ItemType Directory -Path $logDir | Out-Null
}
$logFile = Join-Path $logDir "bridge.log"
$startedAt = [DateTime]::Now.ToString("s")

# Default: fully hidden so recovery does not steal focus. Use -StartVisible for debugging.
$windowStyle = if ($StartVisible) { "Normal" } else { "Hidden" }
$bridgeCmd = @"
`$Host.UI.RawUI.WindowTitle = 'CursorMobileAccess bridge'
Set-Location '$Root'
`$log = '$logFile'
'[$startedAt] bridge start' | Out-File -FilePath `$log -Append -Encoding utf8
npm run start -w @cursormobileaccess/bridge *>&1 |
  ForEach-Object { `$line = `$_.ToString(); `$line | Out-File -FilePath `$log -Append -Encoding utf8 }
"@

$argList = @(
  "-NoProfile",
  "-ExecutionPolicy", "Bypass",
  "-Command", $bridgeCmd
)
if ($StartVisible) {
  $argList = @("-NoExit") + $argList
}

Start-Process -FilePath "powershell.exe" -ArgumentList $argList `
  -WindowStyle $windowStyle -WorkingDirectory $Root | Out-Null

Write-Host "[keep-bridge] Started bridge ($windowStyle); log: $logFile"

# Give it a moment, then verify
Start-Sleep -Seconds 4
if (Test-BridgeUp $hostName $port) {
  Write-Host "[keep-bridge] Recovered - http://${hostName}:${port}/ is up"
  exit 0
}

Write-Warning "[keep-bridge] Started but not responding yet - will retry on next watchdog tick"
exit 1
