# cleanup.ps1 - Supprime les fichiers d'export (.stx) apres l'import.
# Usage :
#   powershell -ExecutionPolicy Bypass -File .\scripts\cleanup.ps1                -> cherche *.stx dans Telechargements et Bureau
#   powershell -ExecutionPolicy Bypass -File .\scripts\cleanup.ps1 -Path C:\chemin\fichier.stx
#
# Le fichier est d'abord ecrase avec des octets aleatoires puis supprime (suppression definitive, pas la Corbeille).
# Limite : sur SSD, l'ecrasement ne garantit pas l'effacement physique (repartition de l'usure).
# La vraie protection est le chiffrement du fichier : une phrase de passe forte rend un exemplaire residuel inexploitable.

param([string]$Path)

$ErrorActionPreference = 'Stop'

if ($Path) {
  $targets = @(Get-Item -LiteralPath $Path)
} else {
  $dirs = @((Join-Path $env:USERPROFILE 'Downloads'), (Join-Path $env:USERPROFILE 'Desktop')) | Where-Object { Test-Path $_ }
  $targets = @($dirs | ForEach-Object { Get-ChildItem -Path $_ -Filter 'session-transfer-*.stx' -File -ErrorAction SilentlyContinue })
}

if ($targets.Count -eq 0) { Write-Host "Aucun fichier .stx trouve."; exit 0 }

foreach ($t in $targets) {
  if ($t.Extension.ToLower() -ne '.stx') { Write-Host "Ignore (pas un .stx) : $($t.FullName)" -ForegroundColor Yellow; continue }
  $answer = Read-Host "Supprimer definitivement $($t.FullName) ? (o/N)"
  if ($answer -ne 'o' -and $answer -ne 'O') { Write-Host "Conserve : $($t.FullName)"; continue }

  $len = $t.Length
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  $fs  = [System.IO.File]::Open($t.FullName, 'Open', 'Write', 'None')
  try {
    $buf = New-Object byte[] 65536
    $written = 0
    while ($written -lt $len) {
      $n = [Math]::Min($buf.Length, $len - $written)
      $rng.GetBytes($buf)
      $fs.Write($buf, 0, $n)
      $written += $n
    }
    $fs.Flush()
  } finally {
    $fs.Close()
    $rng.Dispose()
  }
  Remove-Item -LiteralPath $t.FullName -Force
  Write-Host "Supprime : $($t.FullName)" -ForegroundColor Green
}

Write-Host "Pensez aussi a : desinstaller l'extension des deux navigateurs et a ne pas conserver la phrase de passe."
