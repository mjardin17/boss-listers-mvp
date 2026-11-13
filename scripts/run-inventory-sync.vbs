' Runs the automatic inventory sync with no window. Started by the Windows scheduled task
' "BossListers Inventory Sync". Output goes to logs\inventory-sync-task.log; the one-line
' result of each run goes to logs\inventory-sync.log (written by the sync itself).
Option Explicit
Dim shell, fso, repo, command
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
repo = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
If Not fso.FolderExists(repo & "\logs") Then fso.CreateFolder(repo & "\logs")
command = "cmd /c cd /d """ & repo & """ && node scripts\inventory-count-sync.js --auto --confirm SYNC_ALL_SAFE > logs\inventory-sync-task.log 2>&1"
WScript.Quit shell.Run(command, 0, True)
