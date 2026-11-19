# Salva Motoca! — exportacao PRIVADA do Supabase de TESTES, F1/G1.
# Script preparado em 18/11/2026; nao e execucao de backup.
# Requisitos: Windows PowerShell interativo, Supabase CLI v3 autenticado,
# Docker Desktop iniciado, 7-Zip (7z.exe) disponivel.
# NUNCA executa SQL ou muda o projeto hospedado; somente supabase db dump.
# Backup final AES-256 de 7z fora do repositorio PUBLICO.
# Nao coloque senha, DB URL, dump, output ou backup no GitHub.

#Requires -Version 5.1
[CmdletBinding()]
param()
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$projectRef = 'yivkqyjdeouxnwtwfekc'
$privateRoot = Join-Path $env:LOCALAPPDATA 'SalvaMotoca\backups-privados'
$stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$stage = Join-Path $privateRoot ("stage_" + $stamp)
$archive = Join-Path $privateRoot ("SalvaMotoca-Supabase-TESTES-" + $stamp + ".7z")
$files = @('roles.sql','schema.sql','data.sql','migration_history_schema.sql','migration_history_data.sql')
$completed = $false

function Require-Exe([string]$name) {
  $cmd = Get-Command $name -ErrorAction SilentlyContinue
  if (-not $cmd) { throw "Ferramenta ausente: $name. Nao houve backup." }
  return $cmd.Source
}
function Run-Supabase([string[]]$params) {
  & supabase @params
  if ($LASTEXITCODE -ne 0) { throw "supabase falhou: $($params[0..([Math]::Min(1,$params.Count-1))] -join ' ')" }
}
if ($env:OS -ne 'Windows_NT') { throw 'Este script foi escrito para Windows.' }
$null = Require-Exe 'supabase'
$null = Require-Exe 'docker'
$sevenZip = (Get-Command '7z.exe' -ErrorAction SilentlyContinue)
if ($sevenZip) { $sevenZip = $sevenZip.Source }
else {
  $candidate = Join-Path $env:ProgramFiles '7-Zip\7z.exe'
  if (-not (Test-Path -LiteralPath $candidate)) {
    throw 'Instale o 7-Zip gratuito para gerar arquivo AES-256; nenhum dump foi iniciado.'
  }
  $sevenZip = $candidate
}
$cliVersion = (& supabase --version 2>&1 | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $cliVersion -notmatch '(?<![0-9])3\.') {
  throw "Necessario Supabase CLI v3 (detectado: $cliVersion)."
}
$helpText = (& supabase db dump --help 2>&1 | Out-String)
if ($LASTEXITCODE -ne 0 -or
    $helpText -notmatch '--remote' -or
    $helpText -notmatch '--role-only' -or
    $helpText -notmatch '--data-only') {
  throw 'CLI nao oferece flags esperadas. Leia supabase db dump --help.'
}
& docker info --format '{{.ServerVersion}}' *> $null
if ($LASTEXITCODE -ne 0) { throw 'Docker nao disponivel. Nao houve backup.' }
New-Item -ItemType Directory -Path $privateRoot -Force | Out-Null
New-Item -ItemType Directory -Path $stage -Force | Out-Null
Write-Host 'Projeto autorizado: Salva Motoca / SUPABASE DE TESTES'
Write-Host "Project ref: $projectRef"
Write-Host "Destino PRIVADO local: $privateRoot"
Write-Host 'O CLI devera estar autenticado (supabase login); insira qualquer credencial apenas no prompt seguro do CLI.'
Write-Host 'NAO cole senhas nesta conversa, no GitHub, em logs ou em mensagens.'
try {
  Push-Location $stage
  try {
    Run-Supabase @('db','dump',"--remote=$projectRef",'-f','roles.sql','--role-only')
    Run-Supabase @('db','dump',"--remote=$projectRef",'-f','schema.sql')
    Run-Supabase @('db','dump',"--remote=$projectRef",'-f','data.sql','--data-only','--use-copy',
      '-x','storage.buckets_vectors','-x','storage.vector_indexes')
    Run-Supabase @('db','dump',"--remote=$projectRef",'-f','migration_history_schema.sql',
      '--schema','supabase_migrations')
    Run-Supabase @('db','dump',"--remote=$projectRef",'-f','migration_history_data.sql',
      '--schema','supabase_migrations','--data-only','--use-copy')
    foreach ($name in $files) {
      $item = Get-Item -LiteralPath (Join-Path $stage $name) -ErrorAction Stop
      if ($item.Length -le 0) { throw "Arquivo vazio: $name" }
    }
    $manifest = [ordered]@{
      project_ref = $projectRef
      environment = 'TESTES (nao producao)'
      generated_utc = $stamp
      backup_kind = 'Supabase CLI v3 logical database export'
      backup_verified = $false
      restore_verified = $false
      physical_storage_objects_included = $false
      cli_version = $cliVersion
      source_files = @($files | ForEach-Object {
        $f = Get-Item -LiteralPath (Join-Path $stage $_)
        $h = (Get-FileHash -Algorithm SHA256 -LiteralPath $f.FullName).Hash
        [ordered]@{ name = $_; bytes = $f.Length; sha256 = $h }
      })
    }
    $manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath 'manifest.json' -Encoding UTF8
    # Com -p, 7-Zip pede a senha interativamente; nunca passamos a senha por argumento.
    # Com -mhe=on, nomes de arquivos tambem sao criptografados.
    Write-Host 'Digite uma SENHA FORTE exclusivamente no prompt do 7-Zip.'
    & $sevenZip a '-t7z' '-mhe=on' '-mx=7' '-p' $archive @files 'manifest.json'
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $archive)) {
      throw '7-Zip falhou. Dados brutos permanecem SOMENTE na pasta privada local.'
    }
    Write-Host 'Reinsira a senha para conferir que o arquivo criptografado abre.'
    & $sevenZip t '-p' $archive
    if ($LASTEXITCODE -ne 0) { throw 'O teste criptografico da copia falhou.' }
    $completed = $true
  } finally { Pop-Location }
  if ($completed) {
    # Remocao normal, NAO sobrescrita segura de blocos em SSD.
    Remove-Item -LiteralPath $stage -Recurse -Force
    $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $archive).Hash
    Write-Host 'ARQUIVO CRIPTOGRAFADO CRIADO:' $archive
    Write-Host 'SHA256:' $hash
    Write-Host 'IMPORTANTE: exportacao nao prova RESTAURACAO. G1=BLOCKED, RELEASE=NO_GO.'
    Write-Host 'Copie apenas o .7z criptografado para armazenamento privado adicional.'
  }
} catch {
  Write-Warning $_.Exception.Message
  Write-Warning "Nao declarar G1 aprovado. Revise os arquivos temporarios em $stage; nao envie esses dados ao GitHub."
  throw
}
