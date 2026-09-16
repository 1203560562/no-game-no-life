$ErrorActionPreference = 'Stop'
$tree = (Invoke-WebRequest -Uri 'https://api.github.com/repos/guansss/pixi-live2d-display/git/trees/79f9563ffd2907fb12040ac711ebb4e3431abded?recursive=1' -UseBasicParsing).Content | ConvertFrom-Json
$blobs = $tree.tree | Where-Object { $_.type -eq 'blob' -and ($_.path -like 'haru/*' -or $_.path -like 'shizuku/*') }
$done = 0
foreach ($b in $blobs) {
  $dest = Join-Path 'public/live2d' $b.path
  $dir = Split-Path $dest -Parent
  if (!(Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
  Invoke-WebRequest -Uri ("https://raw.githubusercontent.com/guansss/pixi-live2d-display/master/test/assets/" + $b.path) -OutFile $dest
  $done++
}
Write-Output ("downloaded: " + $done + " files")
