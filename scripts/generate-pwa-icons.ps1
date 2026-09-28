Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$src = Join-Path $root "site\assets\logo-lb.png"
$outDir = Join-Path $root "site\assets\pwa"

if (-not (Test-Path $src)) {
  Write-Error "Logo not found: $src"
  exit 1
}

New-Item -ItemType Directory -Force -Path $outDir | Out-Null

function Save-Icon {
  param(
    [int]$Size,
    [string]$Name,
    [double]$PadRatio
  )

  $img = [System.Drawing.Image]::FromFile($src)
  $canvas = New-Object System.Drawing.Bitmap $Size, $Size
  $g = [System.Drawing.Graphics]::FromImage($canvas)
  $g.Clear([System.Drawing.Color]::FromArgb(255, 244, 242, 237))
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic

  $pad = [int]($Size * $PadRatio)
  $inner = $Size - (2 * $pad)
  $ratio = [Math]::Min($inner / $img.Width, $inner / $img.Height)
  $w = [int]($img.Width * $ratio)
  $h = [int]($img.Height * $ratio)
  $x = [int](($Size - $w) / 2)
  $y = [int](($Size - $h) / 2)

  $g.DrawImage($img, $x, $y, $w, $h)
  $path = Join-Path $outDir $Name
  $canvas.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)

  $g.Dispose()
  $canvas.Dispose()
  $img.Dispose()

  Write-Output $path
}

Save-Icon -Size 192 -Name "icon-192.png" -PadRatio 0.12
Save-Icon -Size 512 -Name "icon-512.png" -PadRatio 0.12
Save-Icon -Size 512 -Name "icon-maskable-512.png" -PadRatio 0.22
Save-Icon -Size 180 -Name "apple-touch-icon.png" -PadRatio 0.12
