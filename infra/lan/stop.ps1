# Ends the classroom WiFi setup and goes back to the normal local setup (data is kept).
$ErrorActionPreference = "Stop"
Set-Location (Resolve-Path (Join-Path $PSScriptRoot "..\.."))
$env:SITE_ADDRESS = "stopping.local-ip.sh"
docker compose -f docker-compose.yml -f docker-compose.lan.yml rm --stop --force caddy web
docker compose up -d
Write-Host "Back to the normal setup (the API needs about 20 seconds to start): npm run dev on http://localhost:3000. Data is unchanged." -ForegroundColor Green
