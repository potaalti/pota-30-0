# Uygulama simgelerini üretir (site/simge-*.png). Kullanım: powershell -ExecutionPolicy Bypass -File veri/simge.ps1
# Tasarım: koyu petrol zemin, turkuaz "30-0", turuncu pota çemberi ve çizgi; maskable için içerik ortadaki %80'de.
Add-Type -AssemblyName System.Drawing
$kok = Join-Path (Split-Path -Parent $PSScriptRoot) "site"

function Ciz([int]$S, [string]$yol) {
  $b = New-Object System.Drawing.Bitmap $S, $S
  $g = [System.Drawing.Graphics]::FromImage($b)
  $g.SmoothingMode = 'AntiAlias'; $g.TextRenderingHint = 'AntiAliasGridFit'
  $k = $S / 512.0
  $g.Clear([System.Drawing.Color]::FromArgb(255, 10, 18, 20))
  # saha çizgileri
  $soluk = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(72, 76, 200, 208)), (6 * $k)
  $g.DrawArc($soluk, [single](66 * $k), [single](280 * $k), [single](380 * $k), [single](380 * $k), 189, 162)
  $g.DrawRectangle($soluk, [single](196 * $k), [single](330 * $k), [single](120 * $k), [single](160 * $k))
  # pota: tahta ve çember
  $beyaz = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(217, 238, 246, 247)), (7 * $k)
  $g.DrawLine($beyaz, [single](216 * $k), [single](90 * $k), [single](296 * $k), [single](90 * $k))
  $turuncu = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 251, 146, 60)), (9 * $k)
  $g.DrawEllipse($turuncu, [single](232 * $k), [single](94 * $k), [single](48 * $k), [single](48 * $k))
  # yazılar
  $orta = New-Object System.Drawing.StringFormat; $orta.Alignment = 'Center'
  $f1 = New-Object System.Drawing.Font "Bahnschrift", ([single](40 * $k)), ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
  $f2 = New-Object System.Drawing.Font "Impact", ([single](172 * $k)), ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)
  $g.DrawString("P O T A   A L T I", $f1, (New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 238, 246, 247))), [single](256 * $k), [single](164 * $k), $orta)
  $g.DrawString("30-0", $f2, (New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 76, 200, 208))), [single](256 * $k), [single](192 * $k), $orta)
  $g.FillRectangle((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 251, 146, 60))), [single](176 * $k), [single](398 * $k), [single](160 * $k), [single](12 * $k))
  $b.Save($yol, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $b.Dispose()
  Write-Output ("{0} ({1} px)" -f $yol, $S)
}

Ciz 512 (Join-Path $kok "simge-512.png")
Ciz 192 (Join-Path $kok "simge-192.png")
Ciz 180 (Join-Path $kok "apple-touch-icon.png")
Ciz 64 (Join-Path $kok "simge-64.png")
