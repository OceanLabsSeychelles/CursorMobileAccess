# Remove the bridge keep-alive scheduled task.
$ErrorActionPreference = "Stop"
$TaskName = "CursorMobileAccessBridgeWatchdog"
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
Write-Host "Scheduled task '$TaskName' removed (if it existed)."
