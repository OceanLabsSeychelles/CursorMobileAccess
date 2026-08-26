# Launch Cursor with Chrome DevTools Protocol on localhost:9222.
# Cursor is single-instance - a second launch without quitting is ignored.
#
# Usage:
#   .\scripts\start-cursor-cdp.cmd
#   .\scripts\start-cursor-cdp.cmd -Force   # quit running Cursor, then relaunch with CDP

param(
  [switch]$Force,
  [int]$WaitSeconds = 20
)

$ErrorActionPreference = "Stop"

function Test-Cdp {
  try {
    $null = Invoke-RestMethod -Uri "http://127.0.0.1:9222/json" -TimeoutSec 2
    return $true
  } catch {
    return $false
  }
}

function Get-CursorProcesses {
  Get-Process -Name "Cursor" -ErrorAction SilentlyContinue
}

function Find-CursorExe {
  $candidates = @(
    "$env:LOCALAPPDATA\Programs\cursor\Cursor.exe",
    "$env:LOCALAPPDATA\Programs\Cursor\Cursor.exe",
    "${env:ProgramFiles}\Cursor\Cursor.exe"
  )
  $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
}

if (Test-Cdp) {
  Write-Host "CDP already up - http://127.0.0.1:9222/json"
  exit 0
}

$running = @(Get-CursorProcesses)
if ($running.Count -gt 0) {
  if (-not $Force) {
    Write-Error @"
Cursor is running without CDP (port 9222 closed).
Fully Exit Cursor (File -> Exit), then re-run this script - or use -Force to quit and relaunch with CDP.
"@
  }
  Write-Host "Stopping $($running.Count) Cursor process(es) for CDP relaunch..."
  $running | Stop-Process -Force
  Start-Sleep -Seconds 2
}

$cursor = Find-CursorExe
if (-not $cursor) {
  Write-Error "Cursor.exe not found. Install Cursor or edit paths in scripts/start-cursor-cdp.ps1"
}

Write-Host "Starting Cursor with --remote-debugging-port=9222"
Write-Host "  $cursor"
Start-Process -FilePath $cursor -ArgumentList "--remote-debugging-port=9222"

$deadline = (Get-Date).AddSeconds($WaitSeconds)
while ((Get-Date) -lt $deadline) {
  if (Test-Cdp) {
    $json = Invoke-RestMethod -Uri "http://127.0.0.1:9222/json" -TimeoutSec 5
    Write-Host "CDP OK - $($json.Count) target(s). http://127.0.0.1:9222/json"
    exit 0
  }
  Start-Sleep -Seconds 1
}

Write-Warning "CDP not responding after ${WaitSeconds}s. Exit any old Cursor instance and retry with -Force."
exit 1
