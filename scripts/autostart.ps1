# Auto-start LevelUP dev server on port 5014 (called from Startup folder shortcut)
$root = 'C:\tmp\TraeCode\LevelUP'
$log = "$root\scripts\autostart.log"
"[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] autostart triggered" | Out-File $log -Append

# Skip if port 5014 already listening (avoid duplicate instance)
$inUse = Get-NetTCPConnection -LocalPort 5014 -State Listen -ErrorAction SilentlyContinue
if ($inUse) {
  "[$(Get-Date -Format 'HH:mm:ss')] port 5014 already listening, skip" | Out-File $log -Append
  exit
}

Set-Location $root
"[$(Get-Date -Format 'HH:mm:ss')] starting npm run dev" | Out-File $log -Append
npm run dev
