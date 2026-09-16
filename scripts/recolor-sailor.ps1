# hiyori-test sailor uniform recolor: texture_01 gray-blue jacket -> white (sailor top)
# Rule: low-saturation + blue hue (b>=r) + luminance 70~135 => jacket pixels,
#       map luminance linearly to 215~250 (white), keep fold shading.
#       Hair (warm hue) / skin (high sat or bright) / skirt (dark) untouched.
# Usage: powershell -File scripts/recolor-sailor.ps1 [-LoIn 70 -HiIn 135 -LoOut 215 -HiOut 250]
param(
  [int]$LoIn = 70, [int]$HiIn = 135, [int]$LoOut = 215, [int]$HiOut = 250,
  [string]$Tex = "texture_01"
)
Add-Type -AssemblyName System.Drawing

$dir = "C:\tmp\TraeCode\LevelUP\public\live2d\hiyori-test\Hiyori.2048"
$file = Join-Path $dir "$Tex.png"
$backup = Join-Path $dir "$Tex.orig.png"

# backup original on first run (not referenced by model3.json, safe to keep)
if (-not (Test-Path $backup)) {
  Copy-Item $file $backup
  Write-Host "backup -> $Tex.orig.png"
} else {
  # restore from original so the script is re-runnable with new params
  Copy-Item $backup $file -Force
  Write-Host "restore from $Tex.orig.png"
}

$bmp = [System.Drawing.Bitmap]::FromFile($file)
$w = $bmp.Width; $h = $bmp.Height
$rect = New-Object System.Drawing.Rectangle(0, 0, $w, $h)
$fmt = [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
$bd = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadWrite, $fmt)
$bytes = New-Object byte[] ($bd.Stride * $h)
[System.Runtime.InteropServices.Marshal]::Copy($bd.Scan0, $bytes, 0, $bytes.Length)

$changed = 0
$span = $HiIn - $LoIn
$ospan = $HiOut - $LoOut
for ($y = 0; $y -lt $h; $y++) {
  $row = $y * $bd.Stride
  for ($x = 0; $x -lt $w; $x++) {
    $i = $row + $x * 4
    if ($bytes[$i + 3] -lt 8) { continue }
    $b = $bytes[$i]; $g = $bytes[$i + 1]; $r = $bytes[$i + 2]  # BGRA
    # low saturation (grayish)
    $max = [Math]::Max($r, [Math]::Max($g, $b))
    $min = [Math]::Min($r, [Math]::Min($g, $b))
    if ($max - $min -ge 40) { continue }
    # blue hue (excludes warm-gray hair shadows)
    if ($b -lt $r) { continue }
    # luminance window
    $l = [Math]::Round(($r + $g + $b) / 3)
    if ($l -lt $LoIn -or $l -gt $HiIn) { continue }
    # whiten: linear luminance mapping, slight cool tint (sailor white)
    $t = ($l - $LoIn) / $span
    $nl = [Math]::Round($LoOut + $t * $ospan)
    $bytes[$i]     = [byte][Math]::Min(255, $nl)     # B
    $bytes[$i + 1] = [byte][Math]::Max(0, $nl - 2)   # G
    $bytes[$i + 2] = [byte][Math]::Max(0, $nl - 6)   # R
    $changed++
  }
}
[System.Runtime.InteropServices.Marshal]::Copy($bytes, 0, $bd.Scan0, $bytes.Length)
$bmp.UnlockBits($bd)
# FromFile locks the source path: save to temp file, dispose, then replace
$tmp = "$env:TEMP\hiyori_recolor.png"
$bmp.Save($tmp, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Move-Item $tmp $file -Force
Write-Host "recolor done: $changed px -> white (sailor top)"
