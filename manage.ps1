# Shukla Photo Organizer -- Dev Server Manager

$ROOT     = Split-Path -Parent $MyInvocation.MyCommand.Definition
$BACKEND  = Join-Path $ROOT "backend"
$FRONTEND = Join-Path $ROOT "frontend"
$BE_PORT  = 8000
$FE_PORT  = 5173

function Write-Header {
    Clear-Host
    Write-Host ""
    Write-Host "  +--------------------------------------------+" -ForegroundColor Cyan
    Write-Host "  |   Shukla Photo Organizer - Dev Manager     |" -ForegroundColor Cyan
    Write-Host "  +--------------------------------------------+" -ForegroundColor Cyan
    Write-Host ""
}

function Get-PortPid {
    param([int]$Port)
    $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
            Select-Object -First 1
    return $conn?.OwningProcess
}

function Show-Status {
    Write-Host "  -- Current status --" -ForegroundColor DarkGray
    foreach ($svc in @(
        @{ Label = "  Backend "; Port = $BE_PORT },
        @{ Label = "  Frontend"; Port = $FE_PORT }
    )) {
        $p = Get-PortPid $svc.Port
        if ($p) {
            $name = (Get-Process -Id $p -ErrorAction SilentlyContinue).Name
            Write-Host "$($svc.Label)  " -NoNewline
            Write-Host "RUNNING" -ForegroundColor Green -NoNewline
            Write-Host "  (port $($svc.Port), pid $p, $name)"
        } else {
            Write-Host "$($svc.Label)  " -NoNewline
            Write-Host "STOPPED" -ForegroundColor DarkGray -NoNewline
            Write-Host "  (port $($svc.Port))"
        }
    }
    Write-Host ""
}

function Stop-Port {
    param([int]$Port)
    $p = Get-PortPid $Port
    if (-not $p) { return $false }
    Write-Host "    Stopping pid $p on port $Port ..." -ForegroundColor Yellow
    Stop-Process -Id $p -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 700
    return $true
}

function Start-Backend {
    Write-Host "    Starting Backend  (port $BE_PORT) ..." -ForegroundColor Cyan
    $venv     = Join-Path $BACKEND ".venv"
    $activate = Join-Path $venv "Scripts\activate.bat"
    $reqs     = Join-Path $BACKEND "requirements.txt"

    # Build a cmd string that mirrors start-backend.bat exactly:
    # create venv + install deps if missing, then activate + run
    $cmd = "cd /d `"$BACKEND`" && "
    $cmd += "if not exist `".venv`" ( "
    $cmd +=   "python -m venv .venv && "
    $cmd +=   "call .venv\Scripts\activate.bat && "
    $cmd +=   "pip install -r requirements.txt "
    $cmd += ") else ( "
    $cmd +=   "call .venv\Scripts\activate.bat "
    $cmd += ") && python main.py"

    Start-Process "cmd.exe" -ArgumentList "/k", $cmd -WindowStyle Normal
    Start-Sleep -Seconds 1
}

function Start-Frontend {
    Write-Host "    Starting Frontend (port $FE_PORT) ..." -ForegroundColor Cyan
    $nm = Join-Path $FRONTEND "node_modules"
    if (-not (Test-Path $nm)) {
        $cmd = "cd /d `"$FRONTEND`" && npm install && npm run dev"
    } else {
        $cmd = "cd /d `"$FRONTEND`" && npm run dev"
    }
    Start-Process "cmd.exe" -ArgumentList "/k", $cmd -WindowStyle Normal
    Start-Sleep -Seconds 1
}

function Show-Menu {
    Write-Host "  -- Actions --" -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "    [1]  Start   Frontend"
    Write-Host "    [2]  Start   Backend"
    Write-Host "    [3]  Start   Both"
    Write-Host ""
    Write-Host "    [4]  Restart Frontend" -ForegroundColor Yellow
    Write-Host "    [5]  Restart Backend"  -ForegroundColor Yellow
    Write-Host "    [6]  Restart Both"     -ForegroundColor Yellow
    Write-Host ""
    Write-Host "    [7]  Stop    Frontend" -ForegroundColor Red
    Write-Host "    [8]  Stop    Backend"  -ForegroundColor Red
    Write-Host "    [9]  Stop    Both"     -ForegroundColor Red
    Write-Host ""
    Write-Host "    [R]  Refresh status"   -ForegroundColor DarkGray
    Write-Host "    [Q]  Quit"             -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "  Choice: " -NoNewline -ForegroundColor White
}

while ($true) {
    Write-Header
    Show-Status
    Show-Menu

    $key = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown').Character.ToString().ToUpper()
    Write-Host $key
    Write-Host ""

    switch ($key) {
        '1' {
            Write-Host "  -> Starting Frontend ..." -ForegroundColor Cyan
            Start-Frontend
            Write-Host "  Done." -ForegroundColor Green
        }
        '2' {
            Write-Host "  -> Starting Backend ..."  -ForegroundColor Cyan
            Start-Backend
            Write-Host "  Done." -ForegroundColor Green
        }
        '3' {
            Write-Host "  -> Starting Frontend + Backend ..." -ForegroundColor Cyan
            Start-Backend
            Start-Frontend
            Write-Host "  Done." -ForegroundColor Green
        }
        '4' {
            Write-Host "  -> Restarting Frontend ..." -ForegroundColor Yellow
            Stop-Port $FE_PORT | Out-Null
            Start-Frontend
            Write-Host "  Done." -ForegroundColor Green
        }
        '5' {
            Write-Host "  -> Restarting Backend ..."  -ForegroundColor Yellow
            Stop-Port $BE_PORT | Out-Null
            Start-Backend
            Write-Host "  Done." -ForegroundColor Green
        }
        '6' {
            Write-Host "  -> Restarting Frontend + Backend ..." -ForegroundColor Yellow
            Stop-Port $BE_PORT | Out-Null
            Stop-Port $FE_PORT | Out-Null
            Start-Backend
            Start-Frontend
            Write-Host "  Done." -ForegroundColor Green
        }
        '7' {
            Write-Host "  -> Stopping Frontend ..." -ForegroundColor Red
            if (Stop-Port $FE_PORT) { Write-Host "  Stopped." -ForegroundColor Green }
            else { Write-Host "  Frontend was not running." -ForegroundColor DarkGray }
        }
        '8' {
            Write-Host "  -> Stopping Backend ..."  -ForegroundColor Red
            if (Stop-Port $BE_PORT) { Write-Host "  Stopped." -ForegroundColor Green }
            else { Write-Host "  Backend was not running." -ForegroundColor DarkGray }
        }
        '9' {
            Write-Host "  -> Stopping Frontend + Backend ..." -ForegroundColor Red
            Stop-Port $FE_PORT | Out-Null
            Stop-Port $BE_PORT | Out-Null
            Write-Host "  Both stopped." -ForegroundColor Green
        }
        'R' { continue }
        'Q' {
            Write-Host "  Goodbye." -ForegroundColor DarkGray
            Write-Host ""
            exit
        }
        default {
            Write-Host "  Invalid choice." -ForegroundColor DarkGray
        }
    }

    Write-Host ""
    Write-Host "  Press any key to return to menu ..."  -ForegroundColor DarkGray
    $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown') | Out-Null
}
