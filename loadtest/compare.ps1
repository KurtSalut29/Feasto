# Measures how Feasto handles the same load with 1 API copy and with 3.
# Run from the Feasto folder:   .\loadtest\compare.ps1            (defaults: 50 users, 30 s)
#                              .\loadtest\compare.ps1 -Vus 100 -Duration 60s
param([int]$Vus = 50, [string]$Duration = "30s")

$ErrorActionPreference = "Stop"
$results = Join-Path $PSScriptRoot "results"
New-Item -ItemType Directory -Force $results | Out-Null

function Invoke-LoadTest([string]$Name) {
    Write-Host "`n=== $Name ===" -ForegroundColor Cyan
    docker run --rm --network feasto_default `
        -v "${PSScriptRoot}:/scripts" -e VUS=$Vus -e DURATION=$Duration `
        grafana/k6:1.3.0 run --quiet --summary-export=/scripts/results/$Name.json /scripts/browse.js | Out-Host
    $summary = Get-Content (Join-Path $results "$Name.json") | ConvertFrom-Json
    [pscustomobject]@{
        Setup          = $Name
        "Requests/s"   = [math]::Round($summary.metrics.http_reqs.rate, 1)
        "Avg ms"       = [math]::Round($summary.metrics.http_req_duration.avg, 1)
        "p95 ms"       = [math]::Round($summary.metrics.http_req_duration.'p(95)', 1)
        "Errors %"     = [math]::Round($summary.metrics.http_req_failed.value * 100, 2)
    }
}

Write-Host "Stopping api-2 and api-3 so only api-1 serves traffic..."
docker compose stop api-2 api-3 | Out-Null
Start-Sleep -Seconds 6
$one = Invoke-LoadTest "1-api-copy"

Write-Host "Starting api-2 and api-3 again..."
docker compose start api-2 api-3 | Out-Null
Start-Sleep -Seconds 10
$three = Invoke-LoadTest "3-api-copies"

Write-Host "`n=== Result ($Vus users for $Duration) ===" -ForegroundColor Green
@($one, $three) | Format-Table -AutoSize
