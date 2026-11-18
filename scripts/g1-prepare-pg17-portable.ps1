# Salva Motoca! / G1 — PostgreSQL 17.12-1 Windows portable bootstrap.
# Default = PLAN (no network, writes or executable invocation).
# -Apply downloads ONLY EDB's pinned ZIP and official .sha256 from the same publisher.
# Nothing is installed globally; no admin, PostgreSQL service, initdb, pg_ctl start,
# hosted Supabase connection, dump, restore or payment. Never touch existing files
# outside the dedicated testes-temporarios/postgres17-portatil directory.
[CmdletBinding()]
param(
    [switch]$Apply,
    [switch]$Plan,
    [switch]$Verify
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ProjectBase = 'D:\boneco\SALVAMOTOCA'
$Checkout = Join-Path $ProjectBase 'codigo'
$TestRoot = Join-Path $ProjectBase 'testes-temporarios'
$Destination = Join-Path $TestRoot 'postgres17-portatil'
$VendorFilename = 'postgresql-17.12-1-windows-x64-binaries.zip'
$VendorUrl = 'https://get.enterprisedb.com/postgresql/' + $VendorFilename
$VendorChecksumUrl = $VendorUrl + '.sha256'
# Exact vendor-published checksum for build 17.12-1 (not a digest invented by us).
# Publisher reference:
# https://github.com/EnterpriseDB/edb-installers/issues/800
# https://get.enterprisedb.com/postgresql/postgresql-17.12-1-windows-x64-binaries.zip.sha256
$PinnedSha256 = 'a2cd8a774389347b70be7748ac4a37ef43cb6ee539c5fc3e85ae264b15e4a04c'

function Require([bool]$condition, [string]$code) {
    if (-not $condition) { throw ("G1_PG17_" + $code) }
}
function Heading([string]$message) { Write-Host ("G1_PG17: " + $message) }
function Verify-ExecutableVersions([string]$binDir) {
    foreach ($name in @('postgres.exe', 'pg_ctl.exe', 'pg_dump.exe', 'psql.exe', 'initdb.exe')) {
        $exe = Join-Path $binDir $name
        Require (Test-Path -LiteralPath $exe -PathType Leaf) ('REQUIRED_BINARY_MISSING_' + $name)
        try {
            $output = & $exe --version 2>&1
            $exitCode = $LASTEXITCODE
        } catch {
            throw ('G1_PG17_BINARY_EXECUTION_UNAVAILABLE_' + $name)
        }
        Require ($exitCode -eq 0) ('BINARY_VERSION_FAILED_' + $name)
        Require (([string]($output -join ' ')) -match '\b17\.12\b') ('WRONG_BINARY_VERSION_' + $name)
        Write-Host ($name + ': PostgreSQL 17.12 confirmado')
    }
}
function Verify-Package([string]$zip) {
    Require (Test-Path -LiteralPath $zip -PathType Leaf) 'ZIP_MISSING'
    $length = (Get-Item -LiteralPath $zip).Length
    Require (($length -gt 100MB) -and ($length -lt 650MB)) 'ZIP_INVALID_LENGTH'
    $digest = (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant()
    Require ($digest -eq $PinnedSha256) 'ZIP_SHA256_MISMATCH'
    Heading 'ZIP SHA256 corresponde ao checksum fixado e publicado pelo fornecedor.'
}
function Confirm-VendorChecksum([string]$content) {
    $match = [regex]::Match($content,
      '^\s*([0-9a-fA-F]{64})\s+\*?postgresql-17\.12-1-windows-x64-binaries\.zip\s*$')
    Require ($match.Success) 'VENDOR_CHECKSUM_FORMAT_INVALID'
    Require ($match.Groups[1].Value.ToLowerInvariant() -eq $PinnedSha256) 'VENDOR_CHECKSUM_MISMATCH'
}
function Validate-ZipEntries([string]$zip) {
    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = [System.IO.Compression.ZipFile]::OpenRead($zip)
    try {
        Require ($archive.Entries.Count -gt 100) 'ZIP_ENTRIES_MISSING'
        Require ($archive.Entries.Count -lt 30000) 'ZIP_TOO_MANY_ENTRIES'
        $size = [int64]0
        foreach ($entry in $archive.Entries) {
            $entryName = $entry.FullName.Replace('\', '/')
            Require ($entryName.StartsWith('pgsql/', [StringComparison]::Ordinal)) 'ZIP_PATH_NOT_PGSQL'
            Require (-not ($entryName -match '(^/|^[a-zA-Z]:|//|(^|/)\.\.?(/|$))')) 'ZIP_UNSAFE_PATH'
            $size += $entry.Length
            Require ($size -lt 4GB) 'ZIP_UNCOMPRESSED_TOO_LARGE'
        }
    } finally {
        $archive.Dispose()
    }
}
function Assert-Repository {
    Require ([Environment]::Is64BitOperatingSystem) 'REQUIRES_WINDOWS_X64'
    Require ($env:OS -eq 'Windows_NT') 'REQUIRES_WINDOWS'
    Require (Test-Path -LiteralPath $Checkout -PathType Container) 'CHECKOUT_NOT_FOUND'
    $origin = (& git -C $Checkout remote get-url origin 2>$null)
    Require ($LASTEXITCODE -eq 0) 'GIT_ORIGIN_NOT_FOUND'
    Require ($origin -match '^(https://github\.com/bonecodesign/salvamotoca(\.git)?|git@github\.com:bonecodesign/salvamotoca(\.git)?)$') 'WRONG_REPOSITORY_ORIGIN'
    $top = (& git -C $Checkout rev-parse --show-toplevel 2>$null)
    Require ($LASTEXITCODE -eq 0) 'GIT_TOPLEVEL_NOT_FOUND'
    Require ([IO.Path]::GetFullPath($top).TrimEnd('\') -ieq [IO.Path]::GetFullPath($Checkout).TrimEnd('\')) 'CHECKOUT_PATH_MISMATCH'
    Require ((& git -C $Checkout branch --show-current) -eq 'chore/g1-restore-proof-catalog-fingerprint-no-go') 'WRONG_BRANCH'
    $dirty = @(& git -C $Checkout status --porcelain)
    Require ($LASTEXITCODE -eq 0 -and -not $dirty) 'DIRTY_CHECKOUT'
}
# Read-only post-download verification. Unlike -Apply this NEVER accesses the network,
# initializes a database cluster, changes the PATH, or creates a directory.
if ($Verify) {
    Require (-not $Apply -and -not $Plan) 'VERIFY_MODE_CONFLICT'
    Require ([Environment]::Is64BitOperatingSystem -and $env:OS -eq 'Windows_NT') 'REQUIRES_WINDOWS_X64'
    # The read-only check does not need a Git checkout: it never modifies local or hosted data.
    Require ($TestRoot.StartsWith($ProjectBase + '\', [StringComparison]::OrdinalIgnoreCase)) 'UNSAFE_TARGET'
    Require ($Destination.StartsWith($TestRoot + '\', [StringComparison]::OrdinalIgnoreCase)) 'UNSAFE_TARGET'
    if (-not (Test-Path -LiteralPath $Destination -PathType Container)) {
        Heading 'NOT_PREPARED: pasta temporaria ainda nao existe. -Plan nao a cria; -Apply a cria automaticamente.'
        Write-Host 'POSTGRESQL_17_12_PORTABLE=NOT_PREPARED'
        Write-Host 'G1_BACKUP_RESTORE=BLOCKED'
        Write-Host 'RELEASE=NO_GO'
        exit 3
    }
    $target = Join-Path $Destination $VendorFilename
    $manifestPath = Join-Path $Destination 'g1-pg17-package-manifest.json'
    Require (Test-Path -LiteralPath $manifestPath -PathType Leaf) 'MANIFEST_MISSING'
    $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
    Require ($manifest.archive_sha256 -eq $PinnedSha256 -and
             $manifest.archive_file -eq $VendorFilename -and
             $manifest.version -eq '17.12-1' -and
             $manifest.backup_restore_proven -eq $false) 'MANIFEST_INVALID'
    Verify-Package $target
    Validate-ZipEntries $target
    Verify-ExecutableVersions (Join-Path $Destination 'pgsql\bin')
    Heading 'READY_VERIFIED_READ_ONLY: binarios portateis conferidos; nenhum backup/restauracao executado.'
    Write-Host 'POSTGRESQL_17_12_PORTABLE=VERIFIED_READ_ONLY'
    Write-Host 'DATABASE_CLUSTER=NOT_INITIALIZED_BY_THIS_SCRIPT'
    Write-Host 'G1_BACKUP_RESTORE=BLOCKED'
    Write-Host 'RELEASE=NO_GO'
    exit 0
}
if ($Plan -or -not $Apply) {
    Heading 'PLAN_ONLY: nenhuma rede, nenhuma escrita, nenhum binario executado.'
    Heading ('Destino permitido: ' + $Destination)
    Heading 'A pasta do destino NAO precisa existir no -Plan. Ela sera criada apenas no -Apply.'
    Heading 'Fonte: EnterpriseDB ZIP PostgreSQL 17.12-1 x64 + sidecar SHA256 oficial.'
    Heading 'Aplicar somente com -Apply; nao faz initdb/restore ou altera o Supabase.'
    Write-Host 'G1_BACKUP_RESTORE=NOT_VERIFIED'
    Write-Host 'RELEASE=NO_GO'
    exit 0
}
Require (-not $Plan) 'PLAN_AND_APPLY_CONFLICT'
Assert-Repository
Require ($TestRoot.StartsWith($ProjectBase + '\', [StringComparison]::OrdinalIgnoreCase)) 'UNSAFE_TARGET'
Require ($Destination.StartsWith($TestRoot + '\', [StringComparison]::OrdinalIgnoreCase)) 'UNSAFE_TARGET'
$null = New-Item -ItemType Directory -Path $Destination -Force
$target = Join-Path $Destination $VendorFilename
$installedDir = Join-Path $Destination 'pgsql'
$bin = Join-Path $installedDir 'bin'
$manifestPath = Join-Path $Destination 'g1-pg17-package-manifest.json'

# TLS1.2 is required on older Windows PowerShell; this changes only this process.
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

# We verify the supplier's independent .sha256 document AND the pinned digest.
Heading 'Consultando exclusivamente o checksum oficial publicado pela EnterpriseDB.'
$checksumResponse = Invoke-WebRequest -Uri $VendorChecksumUrl -UseBasicParsing -TimeoutSec 60
$checksumText = [string]$checksumResponse.Content
Confirm-VendorChecksum $checksumText

if (Test-Path -LiteralPath $target) {
    Heading 'ZIP existente: verificando sem substituir.'
    Verify-Package $target
} else {
    $tempDownload = Join-Path $Destination ('download-' + [guid]::NewGuid().ToString('N') + '.part')
    try {
        Heading 'Baixando ZIP oficial, sem executa-lo.'
        Invoke-WebRequest -Uri $VendorUrl -OutFile $tempDownload -UseBasicParsing -TimeoutSec 1800
        Verify-Package $tempDownload
        # Never overwrite a file that appeared during the download.
        Require (-not (Test-Path -LiteralPath $target)) 'ZIP_TARGET_ALREADY_EXISTS'
        Move-Item -LiteralPath $tempDownload -Destination $target
    } finally {
        if (Test-Path -LiteralPath $tempDownload) {
            Remove-Item -LiteralPath $tempDownload -Force
        }
    }
}
Validate-ZipEntries $target
if (Test-Path -LiteralPath $installedDir) {
    Require (Test-Path -LiteralPath $manifestPath -PathType Leaf) 'UNMANAGED_EXISTING_INSTALLATION'
    $m = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
    Require ($m.archive_sha256 -eq $PinnedSha256 -and $m.archive_file -eq $VendorFilename) 'EXISTING_INSTALLATION_NOT_VERIFIED'
    Heading 'Binarios ja preparados anteriormente: conferindo versoes; sem substituir.'
    Verify-ExecutableVersions $bin
} else {
    Require (-not (Test-Path -LiteralPath $manifestPath)) 'ORPHAN_MANIFEST_BLOCKED'
    $staging = Join-Path $Destination ('extract-' + [guid]::NewGuid().ToString('N'))
    try {
        $null = New-Item -ItemType Directory -Path $staging
        Heading 'Extraindo arquivo validado para subpasta de preparacao exclusiva.'
        Expand-Archive -LiteralPath $target -DestinationPath $staging
        $stagedBin = Join-Path $staging 'pgsql\bin'
        Verify-ExecutableVersions $stagedBin
        Require (-not (Test-Path -LiteralPath $installedDir)) 'INSTALLATION_ALREADY_EXISTS'
        Move-Item -LiteralPath (Join-Path $staging 'pgsql') -Destination $installedDir
        $manifest = [ordered]@{
            project = 'Salva Motoca!'
            purpose = 'G1 isolated local tooling only'
            version = '17.12-1'
            archive_file = $VendorFilename
            archive_sha256 = $PinnedSha256
            checked_at_utc = (Get-Date).ToUniversalTime().ToString('o')
            backup_restore_proven = $false
            hosted_supabase_changes = 'NONE'
        }
        $manifest | ConvertTo-Json | Set-Content -LiteralPath $manifestPath -Encoding UTF8
    } finally {
        if (Test-Path -LiteralPath $staging) {
            Remove-Item -LiteralPath $staging -Recurse -Force
        }
    }
}
Heading ('Ferramentas portateis verificadas em: ' + $bin)
Write-Host 'POSTGRESQL_17_12_PORTABLE=READY'
Write-Host 'DATABASE_CLUSTER=NOT_INITIALIZED'
Write-Host 'POSTGRES_SERVICE=NOT_INSTALLED'
Write-Host 'DATABASE_RESTORE=NOT_EXECUTED'
Write-Host 'SUPABASE_HOSTED_WRITES=NONE'
Write-Host 'G1_BACKUP_RESTORE=BLOCKED'
Write-Host 'RELEASE=NO_GO'
