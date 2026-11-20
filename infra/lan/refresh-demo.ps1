# Refreshes the sample orders, ratings and reviews so they run up to right now (server/src/history.ts).
# Only the @sample.feasto.com people and their orders are replaced; real accounts, stores and orders stay.
# Run it while the classroom setup is up (after infra/lan/start.ps1):
#   .\infra\lan\refresh-demo.ps1
# Sample accounts are made again, so anyone logged in as one logs in again (password demo1234).
$ErrorActionPreference = "Stop"
Set-Location (Resolve-Path (Join-Path $PSScriptRoot "..\.."))

# The address and WiFi name the running setup was started with, so nothing else changes
$running = docker inspect feasto-web-1 --format "{{range .Config.Env}}{{println .}}{{end}}" 2>$null
if (-not $running) { throw "The classroom setup isn't running. Start it first: .\infra\lan\start.ps1" }
foreach ($line in $running) {
    if ($line -match "^SITE_ADDRESS=(.*)$") { $env:SITE_ADDRESS = $Matches[1] }
    if ($line -match "^LAN_WIFI=(.*)$") { $env:LAN_WIFI = $Matches[1] }
}
if (-not $env:SITE_ADDRESS) { throw "Couldn't read the site address from the running setup. Run .\infra\lan\start.ps1 again." }
Write-Host "Refreshing the sample history on https://$env:SITE_ADDRESS (about 2 minutes)..."

$ErrorActionPreference = "Continue"  # docker prints its progress on stderr
docker compose -f docker-compose.yml -f docker-compose.lan.yml --profile tools run --rm --build history
if ($LASTEXITCODE -ne 0) { throw "The refresh failed. Run it again: it starts over by removing the sample history first." }
Write-Host "Done. Sample residents and riders log in again with demo1234." -ForegroundColor Green
