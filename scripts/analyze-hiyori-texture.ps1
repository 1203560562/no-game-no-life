# 分析 hiyori-test 贴图颜色分布（定位服装主色）
# 用法: powershell -File scripts/analyze-hiyori-texture.ps1 [-Tex texture_00]
param([string]$Tex = "texture_01")
Add-Type -AssemblyName System.Drawing

$file = "public\live2d\hiyori-test\Hiyori.2048\$Tex.png"
$bmp = [System.Drawing.Bitmap]::FromFile((Resolve-Path $file))
$w = $bmp.Width; $h = $bmp.Height
Write-Host "size: $w x $h"

$rect = New-Object System.Drawing.Rectangle(0, 0, $w, $h)
$fmt = [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
$bd = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, $fmt)
$bytes = New-Object byte[] ($bd.Stride * $h)
[System.Runtime.InteropServices.Marshal]::Copy($bd.Scan0, $bytes, 0, $bytes.Length)
$bmp.UnlockBits($bd)
$bmp.Dispose()

# 量化到 32 级桶，统计数量 + 空间范围
$buckets = @{}
for ($y = 0; $y -lt $h; $y += 2) {
  for ($x = 0; $x -lt $w; $x += 2) {
    $i = $y * $bd.Stride + $x * 4
    $a = $bytes[$i + 3]
    if ($a -lt 128) { continue }
    $r = $bytes[$i + 2]; $g = $bytes[$i + 1]; $b = $bytes[$i]  # BGRA
    $key = "{0}_{1}_{2}" -f ($r -shr 5), ($g -shr 5), ($b -shr 5)
    if (-not $buckets.ContainsKey($key)) {
      $buckets[$key] = [PSCustomObject]@{ n = 0; rS = 0; gS = 0; bS = 0; x0 = 1e9; x1 = -1; y0 = 1e9; y1 = -1 }
    }
    $e = $buckets[$key]
    $e.n++; $e.rS += $r; $e.gS += $g; $e.bS += $b
    if ($x -lt $e.x0) { $e.x0 = $x }; if ($x -gt $e.x1) { $e.x1 = $x }
    if ($y -lt $e.y0) { $e.y0 = $y }; if ($y -gt $e.y1) { $e.y1 = $y }
  }
}

$buckets.Values | Sort-Object n -Descending | Select-Object -First 30 | ForEach-Object {
  $r = [math]::Round($_.rS / $_.n); $g = [math]::Round($_.gS / $_.n); $b = [math]::Round($_.bS / $_.n)
  $hex = "{0:X2}{1:X2}{2:X2}" -f $r, $g, $b
  "rgb({0,3},{1,3},{2,3}) px {3,7} region ({4},{5})-({6},{7}) #{8}" -f `
    $r, $g, $b, $_.n, $_.x0, $_.y0, $_.x1, $_.y1, $hex
}
