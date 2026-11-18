# G1 Windows PowerShell 5.1 smoke tests, strictly OFFLINE.
# No downloads, no postgres processes, no Supabase, no changes to user's PC.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$script = Join-Path $PSScriptRoot '..\scripts\g1-prepare-pg17-portable.ps1'
if (-not (Test-Path -LiteralPath $script -PathType Leaf)) { throw 'G1_PG17_SCRIPT_MISSING' }

# Windows PowerShell 5.1 is the version used on the user's PC.
$psExe = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
if (-not (Test-Path -LiteralPath $psExe -PathType Leaf)) { throw 'WINDOWS_POWERSHELL_51_MISSING' }
$source = Get-Content -LiteralPath $script -Raw

# Run without -Apply, then explicitly -Plan. Neither may access network or write.
$planDefault = & $psExe -NoLogo -NoProfile -ExecutionPolicy Bypass -File $script 2>&1
if ($LASTEXITCODE -ne 0) { throw 'G1_PG17_DEFAULT_PLAN_FAILED' }
$planExplicit = & $psExe -NoLogo -NoProfile -ExecutionPolicy Bypass -File $script -Plan 2>&1
if ($LASTEXITCODE -ne 0) { throw 'G1_PG17_EXPLICIT_PLAN_FAILED' }
foreach ($output in @((($planDefault | Out-String)), (($planExplicit | Out-String)))) {
    if ($output -notmatch 'PLAN_ONLY' -or
        $output -notmatch 'RELEASE=NO_GO' -or
        $output -notmatch 'G1_BACKUP_RESTORE=NOT_VERIFIED') {
        throw 'G1_PG17_PLAN_DID_NOT_REMAIN_OFFLINE'
    }
}
Write-Host 'G1_PG17_POWERSHELL51_PLAN=PASS'

# -Verify never downloads, extracts or initializes anything. On a fresh Windows
# runner the D: target is absent; exit code 3 is the expected fail-closed state.
$verifyResult = & $psExe -NoLogo -NoProfile -ExecutionPolicy Bypass -File $script -Verify 2>&1
$verifyExit = $LASTEXITCODE
$verifyText = $verifyResult | Out-String
if ($verifyExit -eq 3) {
    if ($verifyText -notmatch 'POSTGRESQL_17_12_PORTABLE=NOT_PREPARED') {
        throw 'G1_PG17_MISSING_DIRECTORY_NOT_EXPLAINED'
    }
} elseif ($verifyExit -eq 0) {
    # A pre-existing, valid local installation may legitimately pass read-only checks.
    if ($verifyText -notmatch 'POSTGRESQL_17_12_PORTABLE=VERIFIED_READ_ONLY') {
        throw 'G1_PG17_VERIFY_DID_NOT_VERIFY_BINARIES'
    }
} else {
    throw ('G1_PG17_VERIFY_UNEXPECTED_EXIT_' + $verifyExit + ': ' + $verifyText)
}
if ($verifyText -notmatch 'G1_BACKUP_RESTORE=BLOCKED' -or $verifyText -notmatch 'RELEASE=NO_GO') {
    throw 'G1_PG17_VERIFY_INCORRECTLY_ALLOWED_RELEASE'
}
if ($source -notmatch [regex]::Escape('if ($Verify)') -or
    $source.IndexOf('if ($Verify)') -gt $source.IndexOf('Invoke-WebRequest -Uri $VendorChecksumUrl')) {
    throw 'G1_PG17_VERIFY_MUST_PRECEDE_NETWORK_OPERATIONS'
}
Write-Host 'G1_PG17_VERIFY_READ_ONLY_FAIL_CLOSED=PASS'

# Reproducible fixed ZIP, source domain and hash; any change needs review.
if ($source -notmatch [regex]::Escape('postgresql-17.12-1-windows-x64-binaries.zip')) { throw 'G1_PG17_ZIP_NOT_PINNED' }
if ($source -notmatch [regex]::Escape('a2cd8a774389347b70be7748ac4a37ef43cb6ee539c5fc3e85ae264b15e4a04c')) {
    throw 'G1_PG17_DIGEST_NOT_PINNED'
}
if ($source -notmatch [regex]::Escape('https://get.enterprisedb.com/postgresql/')) { throw 'G1_PG17_VENDOR_URL_MISSING' }
if ($source -notmatch 'Confirm-VendorChecksum' -or $source -notmatch 'Verify-Package' -or
    $source -notmatch 'Validate-ZipEntries' -or $source -notmatch 'Verify-ExecutableVersions') {
    throw 'G1_PG17_INTEGRITY_GATES_MISSING'
}
Write-Host 'G1_PG17_PINNED_VENDOR_SHA256_AND_PATHS=PASS'

# Make sure that even an unguarded future edit cannot enable operations here.
if ($source -match '(?im)^\s*(?:winget|choco|scoop)\s+install\b' -or
    $source -match '(?im)^\s*pg_ctl(?:\.exe)?\s+start\b' -or
    $source -match '(?im)^\s*initdb(?:\.exe)?\s+' -or
    $source -match 'Invoke-Expression|\biex\s*\(') {
    throw 'G1_PG17_FORBIDDEN_EXTERNAL_EFFECT'
}
Write-Host 'G1_PG17_ZERO_SERVICE_ZERO_CLUSTER_ZERO_REMOTE_WRITE=PASS'
Write-Host 'G1=BLOCKED'
Write-Host 'RELEASE=NO_GO'
