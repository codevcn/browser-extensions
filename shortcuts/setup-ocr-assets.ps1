$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$VendorRoot = Join-Path $Root 'vendor\tesseract'
$CoreRoot = Join-Path $VendorRoot 'core'
$LangRoot = Join-Path $VendorRoot 'lang'

$TesseractVersion = '7.0.0'
$TesseractDataVersion = '1.0.0'

$assets = @(
  @{
    Url = "https://cdn.jsdelivr.net/npm/tesseract.js@$TesseractVersion/dist/tesseract.min.js"
    Path = Join-Path $VendorRoot 'tesseract.min.js'
    MinBytes = 50000
  },
  @{
    Url = "https://cdn.jsdelivr.net/npm/tesseract.js@$TesseractVersion/dist/worker.min.js"
    Path = Join-Path $VendorRoot 'worker.min.js'
    MinBytes = 80000
  },
  @{
    Url = "https://cdn.jsdelivr.net/npm/tesseract.js-core@$TesseractVersion/tesseract-core.wasm.js"
    Path = Join-Path $CoreRoot 'tesseract-core.wasm.js'
    MinBytes = 2000000
  },
  @{
    Url = "https://cdn.jsdelivr.net/npm/tesseract.js-core@$TesseractVersion/tesseract-core-lstm.wasm.js"
    Path = Join-Path $CoreRoot 'tesseract-core-lstm.wasm.js'
    MinBytes = 2000000
  },
  @{
    Url = "https://cdn.jsdelivr.net/npm/tesseract.js-core@$TesseractVersion/tesseract-core-simd.wasm.js"
    Path = Join-Path $CoreRoot 'tesseract-core-simd.wasm.js'
    MinBytes = 2000000
  },
  @{
    Url = "https://cdn.jsdelivr.net/npm/tesseract.js-core@$TesseractVersion/tesseract-core-simd-lstm.wasm.js"
    Path = Join-Path $CoreRoot 'tesseract-core-simd-lstm.wasm.js'
    MinBytes = 2000000
  },
  @{
    Url = "https://cdn.jsdelivr.net/npm/tesseract.js-core@$TesseractVersion/tesseract-core-relaxedsimd.wasm.js"
    Path = Join-Path $CoreRoot 'tesseract-core-relaxedsimd.wasm.js'
    MinBytes = 2000000
  },
  @{
    Url = "https://cdn.jsdelivr.net/npm/tesseract.js-core@$TesseractVersion/tesseract-core-relaxedsimd-lstm.wasm.js"
    Path = Join-Path $CoreRoot 'tesseract-core-relaxedsimd-lstm.wasm.js'
    MinBytes = 2000000
  },
  @{
    Url = "https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@$TesseractDataVersion/4.0.0_best_int/eng.traineddata.gz"
    Path = Join-Path $LangRoot 'eng.traineddata.gz'
    MinBytes = 1000000
  },
  @{
    Url = "https://cdn.jsdelivr.net/npm/@tesseract.js-data/vie@$TesseractDataVersion/4.0.0_best_int/vie.traineddata.gz"
    Path = Join-Path $LangRoot 'vie.traineddata.gz'
    MinBytes = 1000000
  },
  @{
    Url = "https://cdn.jsdelivr.net/npm/tesseract.js@$TesseractVersion/LICENSE.md"
    Path = Join-Path $VendorRoot 'LICENSE-tesseract-js.md'
    MinBytes = 5000
  },
  @{
    Url = "https://cdn.jsdelivr.net/npm/tesseract.js-core@$TesseractVersion/LICENSE"
    Path = Join-Path $VendorRoot 'LICENSE-tesseract-core.txt'
    MinBytes = 5000
  }
)

New-Item -ItemType Directory -Force -Path $VendorRoot, $CoreRoot, $LangRoot | Out-Null

function Download-Asset {
  param(
    [Parameter(Mandatory = $true)][string]$Url,
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][int64]$MinBytes
  )

  if (Test-Path $Path) {
    $existing = Get-Item $Path
    if ($existing.Length -ge $MinBytes) {
      Write-Host "[OK] $($existing.Name) already exists ($($existing.Length) bytes)."
      return
    }
  }

  $tempPath = "$Path.download"
  Remove-Item -Force -ErrorAction SilentlyContinue $tempPath

  for ($attempt = 1; $attempt -le 3; $attempt++) {
    try {
      Write-Host "[GET] $Url"
      Invoke-WebRequest -Uri $Url -OutFile $tempPath -UseBasicParsing -Headers @{ 'User-Agent' = 'ShortcutsExtension-OCR-Setup/3.0.1' }

      $downloaded = Get-Item $tempPath
      if ($downloaded.Length -lt $MinBytes) {
        throw "Downloaded file is unexpectedly small: $($downloaded.Length) bytes."
      }

      Move-Item -Force $tempPath $Path
      Write-Host "[OK] $([System.IO.Path]::GetFileName($Path)) ($($downloaded.Length) bytes)."
      return
    }
    catch {
      Remove-Item -Force -ErrorAction SilentlyContinue $tempPath
      if ($attempt -eq 3) { throw }
      Write-Warning "Attempt $attempt failed. Retrying..."
      Start-Sleep -Seconds 2
    }
  }
}

Write-Host ''
Write-Host 'Shortcuts Extension v3.0.1 - Local OCR asset setup'
Write-Host "Tesseract.js: $TesseractVersion"
Write-Host 'The downloaded runtime is stored locally in the extension folder.'
Write-Host ''

foreach ($asset in $assets) {
  Download-Asset -Url $asset.Url -Path $asset.Path -MinBytes $asset.MinBytes
}

Write-Host ''
Write-Host '[DONE] OCR assets are ready.'
Write-Host 'Next: open chrome://extensions, enable Developer mode, Load unpacked this folder, or click Reload if already installed.'
