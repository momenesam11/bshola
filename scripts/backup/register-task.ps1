# Registers the daily backup in Windows Task Scheduler. Run: npm run backup:schedule
# Runs at 13:00 while you are signed in. If the computer was off at that time, it
# runs as soon as it can. To remove it: Unregister-ScheduledTask -TaskName "Beshola Backup"

$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$node = (Get-Command node).Source

$action = New-ScheduledTaskAction -Execute $node -Argument 'scripts\backup\backup.mjs' -WorkingDirectory $root
$trigger = New-ScheduledTaskTrigger -Daily -At 13:00
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 2)

Register-ScheduledTask -TaskName 'Beshola Backup' -Action $action -Trigger $trigger -Settings $settings -Description 'Daily encrypted backup of the Beshola database and files' -Force | Out-Null

Write-Output 'Daily backup registered: every day at 13:00, or as soon as the computer is on after that.'
