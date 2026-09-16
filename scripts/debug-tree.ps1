$ErrorActionPreference = 'Stop'
$repoApi = 'https://api.github.com/repos/Eikanya/Live2d-model/git/trees/'
$rawBase = 'https://raw.githubusercontent.com/Eikanya/Live2d-model/master/'

# walk to bronya subtree
$cur = 'master'
$plainPath = @()
foreach ($seg in @('%E5%B4%A9%E5%9D%8F%E5%AD%A6%E5%9B%AD2', 'bronya')) {
  $t = (Invoke-WebRequest -Uri ($repoApi + $cur) -UseBasicParsing).Content | ConvertFrom-Json
  $plain = [uri]::UnescapeDataString($seg)
  $plainPath += $plain
  $node = $t.tree | Where-Object { $_.path -eq $plain -and $_.type -eq 'tree' }
  $cur = $node.sha
}
$sub = (Invoke-WebRequest -Uri ($repoApi + $cur + '?recursive=1') -UseBasicParsing).Content | ConvertFrom-Json
Write-Output "--- subtree paths ---"
$sub.tree | Select-Object -First 12 | ForEach-Object { Write-Output ($_.path + " [" + $_.type + "]") }

Write-Output "--- first blob raw URL test ---"
$blob = ($sub.tree | Where-Object { $_.type -eq 'blob' })[0]
$rel = $blob.path.Substring($blob.path.IndexOf('/') + 1)
if ($blob.path.IndexOf('/') -lt 0) { $rel = $blob.path }
$urlPath = (($plainPath + $rel) -join '/')
$urlPath = (($urlPath -split '/') | ForEach-Object { [uri]::EscapeDataString($_) }) -join '/'
$full = $rawBase + $urlPath
Write-Output ("URL: " + $full)
try {
  $resp = Invoke-WebRequest -Uri $full -UseBasicParsing
  Write-Output ("OK status=" + $resp.StatusCode + " len=" + $resp.RawContentLength)
} catch {
  Write-Output ("FAILED: " + $_.Exception.Message)
  # try download_url from contents API instead
  $enc = ($plainPath -join '/')
  $encUrl = (($enc -split '/') | ForEach-Object { [uri]::EscapeDataString($_) }) -join '/'
  $c = (Invoke-WebRequest -Uri ("https://api.github.com/repos/Eikanya/Live2d-model/contents/" + $encUrl + "?ref=master") -UseBasicParsing).Content | ConvertFrom-Json
  Write-Output "--- contents API entries ---"
  $c | Select-Object -First 8 | ForEach-Object { Write-Output ($_.name + " -> " + $_.download_url) }
}
