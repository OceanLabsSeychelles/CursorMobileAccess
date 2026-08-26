# Register CursorMobileAccess to start at Windows logon (Scheduled Task).
# Starts ntfy (when Docker is up), relaunches Cursor with CDP if needed, then the bridge.
#
# Usage:
#   .\scripts\install-startup.ps1
#   .\scripts\install-startup.ps1 -NoForceCursor   # do not kill Cursor if already open without CDP
#   .\scripts\uninstall-startup.ps1

param(
  [switch]$NoForceCursor,
  [int]$DelaySeconds = 45
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$TaskName = "CursorMobileAccess"
$StartAll = Join-Path $Root "scripts\start-all.ps1"

if (-not (Test-Path $StartAll)) {
  Write-Error "Missing $StartAll"
}
if (-not (Test-Path (Join-Path $Root ".env"))) {
  Write-Error "Missing .env - configure the bridge before installing startup."
}

$forceFlag = if ($NoForceCursor) { "" } else { " -ForceCursor" }
# Delay gives Docker Desktop / Tailscale time to come up after login.
$argument = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Normal -Command `"Start-Sleep -Seconds $DelaySeconds; & '$StartAll'$forceFlag`""

$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $argument -WorkingDirectory $Root
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero)

$taskParams = @{
  TaskName    = $TaskName
  Action      = $action
  Trigger     = $trigger
  Settings    = $settings
  Description = "Start CursorMobileAccess (ntfy Cursor CDP bridge) after login"
  Force       = $true
}
Register-ScheduledTask @taskParams | Out-Null

Write-Host "Scheduled task '$TaskName' registered for user $env:USERNAME."
Write-Host "  Delay: ${DelaySeconds}s after logon"
Write-Host "  ForceCursor: $(-not $NoForceCursor)"
Write-Host "  Script: $StartAll"
Write-Host ""
Write-Host "Test now:  Start-ScheduledTask -TaskName '$TaskName'"
Write-Host "Remove:    .\scripts\uninstall-startup.ps1"
Write-Host ""
Write-Host "Tip: set Docker Desktop > Settings > General > Start Docker Desktop when you log in."
