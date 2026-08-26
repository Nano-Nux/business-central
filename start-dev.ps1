param(
    [switch]$OpenBrowser,
    [ValidateRange(1, 600)]
    [int]$ReadyTimeoutSeconds = 120
)

$ErrorActionPreference = 'Stop'

$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RuntimeDir = Join-Path $RootDir '.dev-runtime'
New-Item -ItemType Directory -Path $RuntimeDir -Force | Out-Null

$Services = @(
    [pscustomobject]@{
        Name = 'backend'
        WorkingDirectory = Join-Path $RootDir 'business-central-backend'
        FilePath = 'go.exe'
        Arguments = @('run', './cmd/server')
        Port = 8080
        Url = 'http://localhost:8080'
    },
    [pscustomobject]@{
        Name = 'admin'
        WorkingDirectory = Join-Path $RootDir 'business-central-admin'
        FilePath = 'npm.cmd'
        Arguments = @('run', 'dev', '--', '--port', '3001')
        Port = 3001
        Url = 'http://localhost:3001'
    },
    [pscustomobject]@{
        Name = 'portal'
        WorkingDirectory = Join-Path $RootDir 'business-central-portal'
        FilePath = 'npm.cmd'
        Arguments = @('run', 'dev', '--', '--port', '3000')
        Port = 3000
        Url = 'http://localhost:3000'
    }
)

function Get-RecordedProcess {
    param([string]$PidFile)

    if (-not (Test-Path -LiteralPath $PidFile)) {
        return $null
    }

    $RawValue = (Get-Content -LiteralPath $PidFile -Raw).Trim()
    if ($RawValue -match '^\d+$') {
        return [pscustomobject]@{ Id = [int]$RawValue; StartTimeUtc = $null }
    }

    try {
        return $RawValue | ConvertFrom-Json
    } catch {
        return $null
    }
}

function Test-RecordedProcess {
    param($Record)

    if ($null -eq $Record -or $null -eq $Record.Id) {
        return $false
    }

    $Process = Get-Process -Id ([int]$Record.Id) -ErrorAction SilentlyContinue
    if ($null -eq $Process) {
        return $false
    }
    if ($null -eq $Record.StartTimeUtc) {
        return $true
    }

    return $Process.StartTime.ToUniversalTime().ToString('o') -eq [string]$Record.StartTimeUtc
}

function Test-TcpPort {
    param([int]$Port)

    $Client = [System.Net.Sockets.TcpClient]::new()
    try {
        $Result = $Client.BeginConnect('127.0.0.1', $Port, $null, $null)
        if (-not $Result.AsyncWaitHandle.WaitOne(250)) {
            return $false
        }
        $Client.EndConnect($Result)
        return $true
    } catch {
        return $false
    } finally {
        $Client.Dispose()
    }
}

function Start-DevProcess {
    param($Service)

    $PidFile = Join-Path $RuntimeDir "$($Service.Name).pid"
    $LogFile = Join-Path $RuntimeDir "$($Service.Name).log"
    $ErrorLogFile = Join-Path $RuntimeDir "$($Service.Name).err.log"
    $Record = Get-RecordedProcess $PidFile

    if (Test-RecordedProcess $Record) {
        Write-Host "$($Service.Name) is already running (PID $($Record.Id))."
        return $false
    }
    if (Test-Path -LiteralPath $PidFile) {
        Remove-Item -LiteralPath $PidFile -Force
    }
    if (Test-TcpPort $Service.Port) {
        throw "Cannot start $($Service.Name): port $($Service.Port) is already in use."
    }

    Write-Host "Starting $($Service.Name)..."
    $Process = Start-Process -FilePath $Service.FilePath -ArgumentList $Service.Arguments `
        -WorkingDirectory $Service.WorkingDirectory -RedirectStandardOutput $LogFile `
        -RedirectStandardError $ErrorLogFile -WindowStyle Hidden -PassThru
    $ProcessRecord = [ordered]@{
        Id = $Process.Id
        StartTimeUtc = $Process.StartTime.ToUniversalTime().ToString('o')
        Port = $Service.Port
        Url = $Service.Url
    }
    $ProcessRecord | ConvertTo-Json -Compress | Set-Content -LiteralPath $PidFile -NoNewline
    Write-Host "  PID: $($Process.Id)  Log: $LogFile"
    return $true
}

function Wait-ForDevProcess {
    param($Service)

    $PidFile = Join-Path $RuntimeDir "$($Service.Name).pid"
    $Deadline = (Get-Date).AddSeconds($ReadyTimeoutSeconds)
    while ((Get-Date) -lt $Deadline) {
        if (Test-TcpPort $Service.Port) {
            Write-Host "  $($Service.Name) ready: $($Service.Url)"
            return
        }

        $Record = Get-RecordedProcess $PidFile
        if (-not (Test-RecordedProcess $Record)) {
            $ErrorLogFile = Join-Path $RuntimeDir "$($Service.Name).err.log"
            $Details = if (Test-Path -LiteralPath $ErrorLogFile) {
                (Get-Content -LiteralPath $ErrorLogFile -Tail 12) -join [Environment]::NewLine
            } else {
                'No error log was produced.'
            }
            throw "$($Service.Name) exited before becoming ready.`n$Details"
        }
        Start-Sleep -Milliseconds 500
    }

    $LogFile = Join-Path $RuntimeDir "$($Service.Name).log"
    $ErrorLogFile = Join-Path $RuntimeDir "$($Service.Name).err.log"
    $Details = @()
    if (Test-Path -LiteralPath $LogFile) {
        $Details += (Get-Content -LiteralPath $LogFile -Tail 12)
    }
    if (Test-Path -LiteralPath $ErrorLogFile) {
        $Details += (Get-Content -LiteralPath $ErrorLogFile -Tail 12)
    }
    $Suffix = if ($Details.Count -gt 0) { "`n$($Details -join [Environment]::NewLine)" } else { '' }
    throw "$($Service.Name) did not become ready on port $($Service.Port) within $ReadyTimeoutSeconds seconds. Check $ErrorLogFile.$Suffix"
}

$StartedServices = [System.Collections.Generic.List[object]]::new()
try {
    foreach ($Service in $Services) {
        if (Start-DevProcess $Service) {
            $StartedServices.Add($Service)
        }
    }
    foreach ($Service in $Services) {
        Wait-ForDevProcess $Service
    }
} catch {
    Write-Host "Startup failed: $($_.Exception.Message)" -ForegroundColor Red
    if ($StartedServices.Count -gt 0) {
        Write-Host 'Startup failed. Stopping services started by this run...'
        & (Join-Path $RootDir 'stop-dev.ps1')
    }
    exit 1
}

Write-Host ''
Write-Host 'Development services are ready:'
Write-Host '  Portal:  http://localhost:3000'
Write-Host '  Admin:   http://localhost:3001'
Write-Host '  Backend: http://localhost:8080'
Write-Host '  Swagger: http://localhost:8080/swagger/'
Write-Host ''
Write-Host 'Stop all services with: .\stop-dev.ps1'

if ($OpenBrowser) {
    Start-Process 'http://localhost:3000'
    Start-Process 'http://localhost:3001'
}
