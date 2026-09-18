<#
.SYNOPSIS
  Nastaví FlatMonitoring na Windows tak, aby běžel na pozadí po startu počítače
  a jednou měsíčně skenoval trh.

.DESCRIPTION
  Vytvoří tři naplánované úlohy:
    FlatMonitoring         — spustí aplikaci po startu počítače
    FlatMonitoring-Scan    — sken trhu každé 4 týdny (pondělí 4:00)
    FlatMonitoring-Backup  — denní záloha databáze (3:00)

  Úlohy běží pod tvým účtem. Aplikace poslouchá jen na localhost — ven se
  dostane až tunelem (viz README).

.EXAMPLE
  # Spusť PowerShell JAKO SPRÁVCE v adresáři projektu:
  Set-ExecutionPolicy -Scope Process Bypass -Force
  .\deploy\windows-install.ps1

.EXAMPLE
  # Odinstalace
  .\deploy\windows-install.ps1 -Odinstalovat
#>

param(
    [int]$Port = 3000,
    [switch]$Odinstalovat
)

$ErrorActionPreference = "Stop"

# Kořen projektu = nadřazený adresář tohoto skriptu
$Projekt = Split-Path -Parent $PSScriptRoot
$Ulohy = @("FlatMonitoring", "FlatMonitoring-Scan", "FlatMonitoring-Backup")

function Odeber-Ulohy {
    foreach ($u in $Ulohy) {
        if (Get-ScheduledTask -TaskName $u -ErrorAction SilentlyContinue) {
            Unregister-ScheduledTask -TaskName $u -Confirm:$false
            Write-Host "  Odebrána úloha $u"
        }
    }
}

if ($Odinstalovat) {
    Write-Host "Odinstalace FlatMonitoring..." -ForegroundColor Cyan
    Odeber-Ulohy
    Write-Host "Hotovo. Data v data\ a zalohy\ zůstala nedotčená." -ForegroundColor Green
    exit 0
}

Write-Host "Instalace FlatMonitoring" -ForegroundColor Cyan
Write-Host ("=" * 40)
Write-Host "  Projekt: $Projekt"
Write-Host "  Port:    $Port"

# --- Kontrola prostředí ---
$npm = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source
if (-not $npm) {
    Write-Error "npm nenalezeno. Nainstaluj Node.js 20+ z https://nodejs.org a otevři nové okno PowerShellu."
}

$nodeVerze = (& node --version) -replace '^v', ''
$hlavni = [int]($nodeVerze -split '\.')[0]
if ($hlavni -lt 20) {
    Write-Error "Node.js $nodeVerze je moc starý. Potřebuješ verzi 20 nebo novější."
}
Write-Host "  Node.js: $nodeVerze" -ForegroundColor Green

if (-not (Test-Path (Join-Path $Projekt "data\data.db"))) {
    Write-Warning "Databáze neexistuje. Nejdřív spusť: npm install; npm run setup"
}
if (-not (Test-Path (Join-Path $Projekt ".next"))) {
    Write-Warning "Aplikace není sestavená. Nejdřív spusť: npm run build"
}

New-Item -ItemType Directory -Force -Path (Join-Path $Projekt "logs") | Out-Null

# Staré úlohy pryč, ať je instalace opakovatelná
Odeber-Ulohy

$uzivatel = "$env:USERDOMAIN\$env:USERNAME"

function Nova-Uloha {
    param(
        [string]$Nazev,
        [string]$Prikaz,
        $Spousteni,
        [string]$Popis,
        [switch]$Dlouhobezici   # aplikace, která má běžet pořád
    )

    # -WindowStyle Hidden, aby na ploše neposkakovalo okno konzole
    $akce = New-ScheduledTaskAction -Execute "powershell.exe" `
        -Argument "-NoProfile -WindowStyle Hidden -Command `"& { Set-Location '$Projekt'; $Prikaz }`"" `
        -WorkingDirectory $Projekt

    if ($Dlouhobezici) {
        # ExecutionTimeLimit 0 = bez časového limitu. S výchozími 3 dny (nebo
        # jakýmkoli limitem) by Plánovač úloh běžící aplikaci po vypršení ukončil.
        $nastaveni = New-ScheduledTaskSettingsSet `
            -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
            -ExecutionTimeLimit ([TimeSpan]::Zero) `
            -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
    } else {
        $nastaveni = New-ScheduledTaskSettingsSet `
            -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
            -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 2)
    }

    Register-ScheduledTask -TaskName $Nazev -Action $akce -Trigger $Spousteni `
        -Settings $nastaveni -User $uzivatel -RunLevel Limited -Description $Popis | Out-Null

    Write-Host "  Vytvořena úloha $Nazev" -ForegroundColor Green
}

# 1) Aplikace — po přihlášení, bez časového limitu, po pádu naskočí zpět
Nova-Uloha -Nazev "FlatMonitoring" -Dlouhobezici `
    -Prikaz "`$env:PORT=$Port; npm start *>> logs\app.log" `
    -Spousteni (New-ScheduledTaskTrigger -AtLogOn -User $uzivatel) `
    -Popis "FlatMonitoring — přehled nemovitostního portfolia"

# 2) Sken trhu — každé 4 týdny. Plánovač úloh přes PowerShell neumí spouštění
#    „první den v měsíci“; čtyřtýdenní cyklus je nejbližší ekvivalent.
Nova-Uloha -Nazev "FlatMonitoring-Scan" `
    -Prikaz "npm run market:scan *>> logs\market.log" `
    -Spousteni (New-ScheduledTaskTrigger -Weekly -WeeksInterval 4 -DaysOfWeek Monday -At 4am) `
    -Popis "Sken trhu, každé 4 týdny"

# 3) Denní záloha
Nova-Uloha -Nazev "FlatMonitoring-Backup" `
    -Prikaz "npm run backup *>> logs\backup.log" `
    -Spousteni (New-ScheduledTaskTrigger -Daily -At 3am) `
    -Popis "Denní záloha databáze"

Write-Host ""
Write-Host "Hotovo." -ForegroundColor Green
Write-Host @"

Aplikace naskočí po příštím přihlášení. Spustit hned:

    Start-ScheduledTask -TaskName FlatMonitoring

Pak otevři http://localhost:$Port

Log:          Get-Content logs\app.log -Wait
Přehled úloh: Get-ScheduledTask FlatMonitoring*
Odinstalace:  .\deploy\windows-install.ps1 -Odinstalovat

Partner se dostane dovnitř až přes tunel — viz README, sekce Nasazení.
"@
