# Remove the CursorMobileAccess logon scheduled task.

$ErrorActionPreference = "Stop"
$TaskName = "CursorMobileAccess"

$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if (-not $existing) {
  Write-Host "No scheduled task named '$TaskName'."
  exit 0
}

Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
Write-Host "Removed scheduled task '$TaskName'."
