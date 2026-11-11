# Makes this laptop the Feasto server for everyone on the same WiFi (see DEPLOY.md).
#   .\infra\lan\start.ps1                 uses the WiFi address it finds
#   .\infra\lan\start.ps1 -Ip 192.168.1.10
# Everyone then opens https://192-168-1-10.local-ip.sh on their phone or laptop.
param([string]$Ip)

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $root

# 1. The laptop's address on the WiFi (not the Docker or WSL virtual adapters)
if (-not $Ip) {
    $candidates = Get-NetIPAddress -AddressFamily IPv4 |
        Where-Object { $_.IPAddress -notlike "169.254.*" -and $_.IPAddress -ne "127.0.0.1" -and $_.InterfaceAlias -notmatch "vEthernet|WSL|Docker|Loopback|VirtualBox|VMware" } |
        Sort-Object { if ($_.InterfaceAlias -match "Wi-?Fi|Wireless|WLAN") { 0 } else { 1 } }
    if (-not $candidates) { throw "No WiFi address found. Connect to the WiFi first, or pass -Ip 192.168.x.x." }
    $Ip = $candidates[0].IPAddress
    Write-Host "Using $Ip on '$($candidates[0].InterfaceAlias)'."
}
$site = ($Ip -replace "\.", "-") + ".local-ip.sh"

# 2. The certificate for *.local-ip.sh (public, refreshed by local-ip.sh), so phones trust the HTTPS
$certs = Join-Path $PSScriptRoot "certs"
New-Item -ItemType Directory -Force $certs | Out-Null
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
Invoke-WebRequest "https://local-ip.sh/server.pem" -OutFile (Join-Path $certs "server.pem") -UseBasicParsing
Invoke-WebRequest "https://local-ip.sh/server.key" -OutFile (Join-Path $certs "server.key") -UseBasicParsing
# Read the first certificate in the file (works in Windows PowerShell 5.1 and PowerShell 7)
$pem = Get-Content (Join-Path $certs "server.pem") -Raw
$b64 = [regex]::Match($pem, "-----BEGIN CERTIFICATE-----(.+?)-----END CERTIFICATE-----", "Singleline").Groups[1].Value -replace "\s", ""
$cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2 (, [Convert]::FromBase64String($b64))
if ($cert.NotAfter -lt (Get-Date)) { throw "The local-ip.sh certificate has expired ($($cert.NotAfter)). Use the cloud setup in DEPLOY.md instead." }
Write-Host "Certificate for $($cert.Subject), valid until $($cert.NotAfter.ToString('MMM d, yyyy'))."

# 3. Let the WiFi reach ports 80 and 443 (needs an administrator PowerShell the first time)
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not (Get-NetFirewallRule -DisplayName "Feasto LAN (80, 443)" -ErrorAction SilentlyContinue)) {
    if ($isAdmin) {
        New-NetFirewallRule -DisplayName "Feasto LAN (80, 443)" -Direction Inbound -Protocol TCP -LocalPort 80, 443 -Action Allow -Profile Private, Public | Out-Null
        Write-Host "Opened ports 80 and 443 in Windows Firewall."
    } else {
        Write-Warning "Run this once in an administrator PowerShell so phones can connect (it adds a firewall rule for ports 80 and 443)."
    }
}
$net = Get-NetConnectionProfile | Where-Object { $_.IPv4Connectivity -ne "Disconnected" } | Select-Object -First 1
if ($net -and $net.NetworkCategory -eq "Public") {
    Write-Warning "This WiFi is set as a Public network. If phones can't connect: Settings > Network & internet > Wi-Fi > this network > Private."
}

# 4. Start everything: the backend, the web app and Caddy (HTTPS)
$env:SITE_ADDRESS = $site
$ErrorActionPreference = "Continue"  # docker prints its progress on stderr
docker compose -f docker-compose.yml -f docker-compose.lan.yml up -d --build
if ($LASTEXITCODE -ne 0) { throw "docker compose failed." }

Write-Host ""
Write-Host "Feasto is running on this laptop. On the same WiFi, open:" -ForegroundColor Green
Write-Host "    https://$site" -ForegroundColor Green
Write-Host "Admin > System shows this laptop's workers and load. Stop with .\infra\lan\stop.ps1"
