$ErrorActionPreference = 'Stop'

$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RuntimeDir = Join-Path $RootDir '.dev-runtime'

$Services = @(
    [pscustomobject]@{ Name = 'portal'; Port = 3000 },
    [pscustomobject]@{ Name = 'admin'; Port = 3001 },
    [pscustomobject]@{ Name = 'backend'; Port = 8080 }
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

function Get-DescendantProcessIds {
    param([int[]]$RootIds)

    $Processes = @(Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId)
    $AllIds = [System.Collections.Generic.List[int]]::new()
    $PendingIds = [System.Collections.Generic.Queue[int]]::new()
    foreach ($RootId in $RootIds) {
        $PendingIds.Enqueue($RootId)
    }

    while ($PendingIds.Count -gt 0) {
        $ParentId = $PendingIds.Dequeue()
        foreach ($Child in $Processes | Where-Object { $_.ParentProcessId -eq $ParentId }) {
            if (-not $AllIds.Contains([int]$Child.ProcessId)) {
                $AllIds.Add([int]$Child.ProcessId)
                $PendingIds.Enqueue([int]$Child.ProcessId)
            }
        }
    }
    return $AllIds.ToArray()
}

function Get-PortOwnerIds {
    param([int]$Port)

    return @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique)
}

function Stop-DevProcess {
    param($Service)

    $PidFile = Join-Path $RuntimeDir "$($Service.Name).pid"
    if (-not (Test-Path -LiteralPath $PidFile)) {
        Write-Host "$($Service.Name) is not running (no PID file)."
        return $true
    }

    $Record = Get-RecordedProcess $PidFile
    $RootIds = [System.Collections.Generic.List[int]]::new()
    if (Test-RecordedProcess $Record) {
        $RootIds.Add([int]$Record.Id)
    }
    foreach ($OwnerId in Get-PortOwnerIds $Service.Port) {
        if (-not $RootIds.Contains([int]$OwnerId)) {
            $RootIds.Add([int]$OwnerId)
        }
    }

    if ($RootIds.Count -eq 0) {
        Write-Host "$($Service.Name) is not running (stale PID file)."
        Remove-Item -LiteralPath $PidFile -Force
        return $true
    }

    Write-Host "Stopping $($Service.Name)..."
    $DescendantIds = @(Get-DescendantProcessIds $RootIds.ToArray())
    [array]::Reverse($DescendantIds)
    foreach ($ProcessId in @($DescendantIds) + @($RootIds.ToArray())) {
        Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
    }

    $Deadline = (Get-Date).AddSeconds(10)
    do {
        Start-Sleep -Milliseconds 250
        $RemainingOwners = @(Get-PortOwnerIds $Service.Port)
        $RemainingRoots = @($RootIds | Where-Object { Get-Process -Id $_ -ErrorAction SilentlyContinue })
    } while (($RemainingOwners.Count -gt 0 -or $RemainingRoots.Count -gt 0) -and (Get-Date) -lt $Deadline)

    if ($RemainingOwners.Count -gt 0 -or $RemainingRoots.Count -gt 0) {
        $RemainingIds = @(($RemainingOwners + $RemainingRoots) | Select-Object -Unique)
        Write-Host "Could not fully stop $($Service.Name). Remaining PIDs: $($RemainingIds -join ', ')." -ForegroundColor Red
        return $false
    }

    Remove-Item -LiteralPath $PidFile -Force
    Write-Host "  $($Service.Name) stopped."
    return $true
}

$AllStopped = $true
foreach ($Service in $Services) {
    if (-not (Stop-DevProcess $Service)) {
        $AllStopped = $false
    }
}

if (-not $AllStopped) {
    Write-Host 'One or more development services could not be stopped.' -ForegroundColor Red
    exit 1
}

Write-Host 'Development services stopped.'
