# audit.ps1 - Verification locale AVANT d'installer l'extension.
# Lecture seule : ne modifie rien, n'ouvre aucune connexion reseau.
# Usage :  powershell -ExecutionPolicy Bypass -File .\scripts\audit.ps1
# (Bypass s'applique uniquement a CE processus ; aucun reglage Windows n'est modifie.)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$ext  = Join-Path $root 'extension'
$fail = 0

function Report($ok, $msg) {
  if ($ok) { Write-Host "[OK] $msg" -ForegroundColor Green }
  else     { Write-Host "[!!] $msg" -ForegroundColor Red; $script:fail++ }
}

Write-Host "== 1. Contenu de l'extension ==" 
$files = Get-ChildItem -Path $ext -Recurse -File
$files | ForEach-Object { Write-Host ("  " + $_.FullName.Substring($ext.Length + 1)) }
$allowed = @('.js', '.html', '.css', '.json')
$odd = $files | Where-Object { $allowed -notcontains $_.Extension.ToLower() }
Report ($odd.Count -eq 0) "Aucun fichier d'un type inattendu (exe, dll, wasm, ...)"

Write-Host "`n== 2. Manifeste ==" 
$m = Get-Content (Join-Path $ext 'manifest.json') -Raw | ConvertFrom-Json
$perms = @($m.permissions) | Sort-Object
Report (($perms -join ',') -eq 'cookies,downloads') ("permissions = " + ($perms -join ', ') + "  (attendu : cookies, downloads)")
Report ((@($m.host_permissions) -join ',') -eq '<all_urls>') ("host_permissions = " + (@($m.host_permissions) -join ', '))
Report ($null -eq $m.content_scripts) "Aucun content script (rien n'est injecte dans les pages web)"
Report ($null -eq $m.externally_connectable) "Pas de externally_connectable"
Report ($null -eq $m.web_accessible_resources) "Pas de web_accessible_resources"
Report ($m.incognito -eq 'not_allowed') "Navigation privee interdite pour l'extension"
Report ($m.content_security_policy.extension_pages -match "connect-src 'none'") "CSP : connect-src 'none' (aucune connexion reseau possible depuis les pages)"

Write-Host "`n== 3. Recherche d'API reseau ou dynamiques dans le code ==" 
$patterns = 'fetch\(', 'XMLHttpRequest', 'WebSocket', 'sendBeacon', 'EventSource', 'importScripts', 'eval\(', 'new Function', 'innerHTML', 'outerHTML', 'document\.write', 'https?://'
$code = $files | Where-Object { @('.js', '.html', '.css') -contains $_.Extension.ToLower() }
foreach ($p in $patterns) {
  $hits = $code | Select-String -Pattern $p
  Report (-not $hits) ("Motif absent : " + $p)
  if ($hits) { $hits | ForEach-Object { Write-Host ("     " + $_.Filename + ":" + $_.LineNumber) } }
}

Write-Host "`n== 4. Empreintes SHA-256 ==" 
$sumsFile = Join-Path $root 'SHA256SUMS.txt'
if (Test-Path $sumsFile) {
  $expected = @{}
  Get-Content $sumsFile | ForEach-Object {
    if ($_ -match '^([0-9a-fA-F]{64})\s+\*?(.+)$') { $expected[$Matches[2].Trim()] = $Matches[1].ToLower() }
  }
  foreach ($f in $files) {
    $rel = 'extension/' + $f.FullName.Substring($ext.Length + 1).Replace('\', '/')
    $h = (Get-FileHash -Algorithm SHA256 -Path $f.FullName).Hash.ToLower()
    Report ($expected[$rel] -eq $h) ("Empreinte conforme : " + $rel)
  }
  Write-Host "  (SHA256SUMS.txt prouve seulement que les fichiers n'ont pas change depuis leur livraison ; il ne remplace pas votre relecture du code.)"
} else {
  Write-Host "  SHA256SUMS.txt absent : verification des empreintes ignoree."
}

Write-Host ""
if ($fail -eq 0) { Write-Host "Audit termine : aucun point bloquant detecte." -ForegroundColor Green; exit 0 }
else { Write-Host "Audit termine : $fail point(s) a examiner AVANT toute installation." -ForegroundColor Red; exit 1 }
