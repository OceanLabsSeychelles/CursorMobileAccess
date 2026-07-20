# Launch Cursor with Chrome DevTools Protocol on localhost:9222.
# Cursor is single-instance — fully Exit Cursor first, then run this script.

$ErrorActionPreference = "Stop"

$candidates = @(
  "$env:LOCALAPPDATA\Programs\cursor\Cursor.exe",
  "$env:LOCALAPPDATA\Programs\Cursor\Cursor.exe",
  "${env:ProgramFiles}\Cursor\Cursor.exe"
)

$cursor = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $cursor) {
  Write-Error "Cursor.exe not found. Install Cursor or edit paths in scripts/start-cursor-cdp.ps1"
}

Write-Host "Starting Cursor with --remote-debugging-port=9222"
Write-Host "  $cursor"
Start-Process -FilePath $cursor -ArgumentList "--remote-debugging-port=9222"
Start-Sleep -Seconds 3

try {
  $json = Invoke-RestMethod -Uri "http://127.0.0.1:9222/json" -TimeoutSec 5
  Write-Host "CDP OK — $($json.Count) target(s). Example: http://127.0.0.1:9222/json"
} catch {
  Write-Warning "CDP not responding yet. Exit any old Cursor instance and retry."
}
