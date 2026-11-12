# Creates the Windows scheduled task "BossListers Inventory Sync".
# It runs the automatic inventory sync every 15 minutes and at sign-in, with no window.
# Run once:  powershell -ExecutionPolicy Bypass -File scripts\install-inventory-sync-task.ps1
# Remove:    Unregister-ScheduledTask -TaskName "BossListers Inventory Sync" -Confirm:$false

$name = "BossListers Inventory Sync"
$launcher = Join-Path $PSScriptRoot "run-inventory-sync.vbs"
if (-not (Test-Path $launcher)) { Write-Output "Launcher not found: $launcher"; exit 1 }

$action = New-ScheduledTaskAction -Execute "wscript.exe" -Argument "`"$launcher`""
$every15 = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 15)
$atLogon = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 10)
$about = "Every 15 minutes: copies eBay stock counts into BossListers so sold items drop to 0. Changes the BossListers count only."

try {
  Register-ScheduledTask -TaskName $name -Action $action -Trigger @($every15, $atLogon) -Settings $settings `
    -Description $about -Force -ErrorAction Stop | Out-Null
  $task = Get-ScheduledTask -TaskName $name
  Write-Output "Installed: $name ($($task.State)). First run in about one minute, then every 15 minutes."
} catch {
  Write-Output "Could not install the task: $($_.Exception.Message)"
  exit 1
}
