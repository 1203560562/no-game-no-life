# Inspect specific Live2D model directories (structure check)
$ErrorActionPreference = 'Stop'

# repo path -> URL-encoded
$targets = @(
  @{ label = 'bronya';      enc = '%E5%B4%A9%E5%9D%8F%E5%AD%A6%E5%9B%AD2/bronya' },
  @{ label = 'Kiana';       enc = '%E5%B4%A9%E5%9D%8F%E5%AD%A6%E5%9B%AD2/Kiana' },
  @{ label = 'himeko';      enc = '%E5%B4%A9%E5%9D%8F%E5%AD%A6%E5%9B%AD2/himeko' },
  @{ label = 'aqua';        enc = '%E4%B8%BA%E7%BE%8E%E5%A5%BD%E7%9A%84%E4%B8%96%E7%95%8C%E7%8C%AE%E4%B8%8A%E7%A5%9D%E7%A6%8F%EF%BC%81Fantastic%20Days/1014100aqua' },
  @{ label = 'gfl_new';     enc = '%E5%B0%91%E5%A5%B3%E5%89%8D%E7%BA%BF%20girls%20Frontline/live2dnew' }
)

foreach ($t in $targets) {
  try {
    $items = (Invoke-WebRequest -Uri "https://api.github.com/repos/Eikanya/Live2d-model/contents/$($t.enc)?ref=master" -UseBasicParsing).Content | ConvertFrom-Json
    Write-Output ("=== " + $t.label + " ===")
    $items | Select-Object -First 15 | ForEach-Object { Write-Output ("  " + $_.name + " " + $_.size) }
  } catch {
    Write-Output ("=== " + $t.label + " FAILED: " + $_.Exception.Message)
  }
}
