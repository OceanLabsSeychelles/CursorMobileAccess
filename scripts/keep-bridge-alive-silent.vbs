' Run keep-bridge-alive.ps1 with no console window (avoids focus steal).
' Used by the CursorMobileAccessBridgeWatchdog scheduled task.
Option Explicit
Dim sh, root, ps1, cmd
Set sh = CreateObject("WScript.Shell")
root = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
root = CreateObject("Scripting.FileSystemObject").GetParentFolderName(root)
ps1 = root & "\scripts\keep-bridge-alive.ps1"
cmd = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & ps1 & """"
' 0 = hidden window, False = do not wait
sh.Run cmd, 0, False
