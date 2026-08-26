# Register a recurring scheduled task that restarts the bridge if it dies.
# Launches via a VBScript wrapper so the tick does not flash a console / steal focus.
#
# Usage:
#   .\scripts\install-bridge-watchdog.ps1
#   .\scripts\install-bridge-watchdog.ps1 -IntervalMinutes 2
#   .\scripts\uninstall-bridge-watchdog.ps1

param(
  [int]$IntervalMinutes = 2
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$TaskName = "CursorMobileAccessBridgeWatchdog"
$KeepAlive = Join-Path $Root "scripts\keep-bridge-alive.ps1"
$SilentLauncher = Join-Path $Root "scripts\keep-bridge-alive-silent.vbs"

if (-not (Test-Path $KeepAlive)) {
  Write-Error "Missing $KeepAlive"
}
if (-not (Test-Path $SilentLauncher)) {
  Write-Error "Missing $SilentLauncher"
}
if (-not (Test-Path (Join-Path $Root ".env"))) {
  Write-Error "Missing .env - configure the bridge before installing the watchdog."
}
if ($IntervalMinutes -lt 1) {
  Write-Error "IntervalMinutes must be >= 1"
}

# Unregister prior version so we can change the trigger interval cleanly
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

# wscript + .vbs with window style 0 avoids the PowerShell console flash that
# Task Scheduler causes even with -WindowStyle Hidden.
$action = New-ScheduledTaskAction `
  -Execute "wscript.exe" `
  -Argument "//B `"$SilentLauncher`"" `
  -WorkingDirectory $Root

# Start shortly after registration, then every N minutes for ~10 years
# (Task Scheduler rejects TimeSpan.MaxValue as RepetitionDuration).
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) `
  -RepetitionInterval (New-TimeSpan -Minutes $IntervalMinutes) `
  -RepetitionDuration (New-TimeSpan -Days 3650)

$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 5) `
  -Hidden

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Description "Restart CursorMobileAccess bridge if http://BRIDGE_HOST:PORT stops responding (silent)" `
  -Force | Out-Null

Write-Host "Scheduled task '$TaskName' registered."
Write-Host "  Interval: every ${IntervalMinutes} minute(s)"
Write-Host "  Launcher: $SilentLauncher"
Write-Host ""
Write-Host "Test now:  Start-ScheduledTask -TaskName '$TaskName'"
Write-Host "Remove:    .\scripts\uninstall-bridge-watchdog.cmd"
