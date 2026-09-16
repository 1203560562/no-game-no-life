# Download Live2D models via contents API (uses official download_url, avoids encoding pitfalls)
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Add-Type -AssemblyName System.Net.Http
$http = New-Object System.Net.Http.HttpClient
$http.Timeout = [TimeSpan]::FromSeconds(120)

# local name -> repo path (URL-encoded, for contents API)
$models = @(
  @{ local = 'bronya'; enc = '%E5%B4%A9%E5%9D%8F%E5%AD%A6%E5%9B%AD2/bronya' },
  @{ local = 'kiana';  enc = '%E5%B4%A9%E5%9D%8F%E5%AD%A6%E5%9B%AD2/Kiana' },
  @{ local = 'himeko'; enc = '%E5%B4%A9%E5%9D%8F%E5%AD%A6%E5%9B%AD2/himeko' },
  @{ local = 'aqua';   enc = '%E4%B8%BA%E7%BE%8E%E5%A5%BD%E7%9A%84%E4%B8%96%E7%95%8C%E7%8C%AE%E4%B8%8A%E7%A5%9D%E7%A6%8F%EF%BC%81Fantastic%20Days/1014100aqua' }
)

$script:nFiles = 0
$script:nBytes = 0

function Download-Dir($encPath, $localDir) {
  $api = "https://api.github.com/repos/Eikanya/Live2d-model/contents/$encPath`?ref=master"
  $items = (Invoke-WebRequest -Uri $api -UseBasicParsing).Content | ConvertFrom-Json
  if (!(Test-Path $localDir)) { New-Item -ItemType Directory -Path $localDir -Force | Out-Null }
  foreach ($it in $items) {
    if ($it.type -eq 'dir') {
      Download-Dir ($encPath + '/' + [uri]::EscapeDataString($it.name)) (Join-Path $localDir $it.name)
    } elseif ($it.type -eq 'file') {
      $dest = Join-Path $localDir $it.name
      $uri = [uri]$it.download_url
      $bytesArr = $http.GetByteArrayAsync($uri).GetAwaiter().GetResult()
      [IO.File]::WriteAllBytes($dest, $bytesArr)
      $script:nFiles++
      $script:nBytes += $it.size
    }
  }
}

foreach ($m in $models) {
  $script:nFiles = 0; $script:nBytes = 0
  $outDir = Join-Path 'public/live2d' $m.local
  if (Test-Path $outDir) { Remove-Item $outDir -Recurse -Force }
  Download-Dir $m.enc $outDir
  Write-Output ("downloaded " + $m.local + ": " + $script:nFiles + " files, " + [math]::Round($script:nBytes / 1MB, 2) + " MB")
}
