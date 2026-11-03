# Move the whole project (code, .env, uploads, database) to another Windows PC.
#   Old PC, repo root:   powershell -ExecutionPolicy Bypass -File scripts\move-machine.ps1 export
#   New PC, unzipped:    powershell -ExecutionPolicy Bypass -File scripts\move-machine.ps1 import
# The bundle holds .env and a full DB dump (real user data): move it privately, delete it after.
param([Parameter(Mandatory)][ValidateSet('export', 'import')][string]$Mode)
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
$root = (Get-Location).Path

function Run {
  & $args[0] $args[1..($args.Count - 1)]
  if ($LASTEXITCODE -ne 0) { throw "failed: $($args -join ' ')" }
}

function Wait-Mysql {
  Run docker compose up -d mysql
  for ($i = 0; $i -lt 40; $i++) {
    docker compose exec -T mysql mysqladmin ping --host=127.0.0.1 --silent *> $null
    if ($LASTEXITCODE -eq 0) { return }
    Start-Sleep 3
  }
  throw 'MySQL did not become ready in 2 minutes'
}

if ($Mode -eq 'export') {
  $stage = Join-Path $env:TEMP 'zuvuutavuu-bundle'
  $out = Join-Path (Split-Path $root -Parent) 'ZuvuuTavuu-full.zip'
  if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
  if (Test-Path $out) { Remove-Item $out -Force }

  Wait-Mysql
  # --result-file + cp keeps UTF-8 intact (PowerShell's > would re-encode it)
  Run docker compose exec -T mysql sh -c 'MYSQL_PWD=$MYSQL_PASSWORD mysqldump -u$MYSQL_USER --single-transaction --no-tablespaces --default-character-set=utf8mb4 --databases ongod --result-file=/tmp/ongod.sql'

  # code + .env + apps/api/data (uploads); packages and build output are rebuilt by pnpm install
  robocopy $root $stage /E /XD node_modules dist .turbo test-results .expo /XF 'ZuvuuTavuu*.zip' /NFL /NDL /NJH /NJS /NP | Out-Null
  if ($LASTEXITCODE -ge 8) { throw 'robocopy failed' }
  Run docker compose cp mysql:/tmp/ongod.sql (Join-Path $stage 'ongod.sql')

  Run tar -a -cf $out -C $stage .
  Remove-Item $stage -Recurse -Force
  Write-Host "Done: $out ($([math]::Round((Get-Item $out).Length / 1MB)) MB). Contains secrets and user data."
}
else {
  if (-not (Test-Path .env)) { throw '.env missing: the bundle should contain it' }
  if (-not (Test-Path ongod.sql)) { throw 'ongod.sql missing: run import from the unzipped bundle folder' }
  Run node -v
  Run corepack enable
  Run docker version --format '{{.Server.Version}}'
  Run pnpm install

  Wait-Mysql
  Run docker compose cp ongod.sql mysql:/tmp/ongod.sql
  Run docker compose exec -T mysql sh -c 'MYSQL_PWD=$MYSQL_ROOT_PASSWORD mysql -uroot --default-character-set=utf8mb4 < /tmp/ongod.sql'
  Write-Host 'Imported. Now run: pnpm dev   (then delete ongod.sql)'
}
