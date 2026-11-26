# Execute SOMENTE no computador do fundador, fora de CI e sem transcrição.
# Não grava arquivos de credenciais. Não envie o conteúdo do clipboard ao chat.
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -eq 'true' -or $env:CI -eq 'true') { throw 'Somente em computador privado.' }
function Read-Private([string]$Prompt) {
    $secure = Read-Host -Prompt $Prompt -AsSecureString
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr); $secure.Dispose() }
}
try {
    Write-Host 'Use apenas o aplicativo Salva Motoca G1 Backup já existente.'
    Start-Process 'https://www.dropbox.com/developers/apps'
    $key = (Read-Host 'App key').Trim()
    $secret = Read-Private 'App secret (entrada oculta)'
    if ($key -notmatch '^[A-Za-z0-9]+$' -or [string]::IsNullOrWhiteSpace($secret)) { throw 'Configuração inválida' }
    $url = 'https://www.dropbox.com/oauth2/authorize?response_type=code&token_access_type=offline&force_reapprove=true&client_id=' +
      [Uri]::EscapeDataString($key) + '&scope=' +
      [Uri]::EscapeDataString('files.metadata.read files.content.write')
    Start-Process $url
    $code = (Read-Private 'Código de autorização Dropbox (entrada oculta)').Trim()
    if ([string]::IsNullOrWhiteSpace($code)) { throw 'Código ausente' }
    $reply = Invoke-RestMethod -Uri 'https://api.dropboxapi.com/oauth2/token' -Method Post -ContentType 'application/x-www-form-urlencoded' -Body @{
        code=$code; grant_type='authorization_code'; client_id=$key; client_secret=$secret
    } -TimeoutSec 30 -MaximumRedirection 0
    if (-not $reply.refresh_token -or -not $reply.access_token -or $reply.token_type -ne 'bearer') { throw 'Resposta sem autorização renovável' }
    $scopes = ([string]$reply.scope).Split(' ')
    if ('files.metadata.read' -notin $scopes -or 'files.content.write' -notin $scopes) { throw 'Escopo insuficiente' }
    # Verifica o cofre EXATO antes de preparar a configuração; não lê arquivos.
    $meta = Invoke-RestMethod -Uri 'https://api.dropboxapi.com/2/files/get_metadata' -Method Post -ContentType 'application/json' -Headers @{Authorization=('Bearer '+$reply.access_token)} -Body '{"path":"/backup-testes"}' -TimeoutSec 30 -MaximumRedirection 0
    $sha = [Security.Cryptography.SHA256]::Create()
    try { $hash = ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes([string]$meta.id)))).Replace('-','').ToLowerInvariant() }
    finally { $sha.Dispose() }
    if ($meta.'.tag' -ne 'folder' -or $meta.name -ne 'backup-testes' -or $hash -ne '842abada83cbee23ff1a2ecf76de0b0ec197dfada7688bb6e68a926b983d480c') { throw 'Cofre incorreto' }
    $json = @{app_key=$key;app_secret=$secret;refresh_token=$reply.refresh_token} | ConvertTo-Json -Compress
    Set-Clipboard -Value $json
    Write-Host 'Cofre confirmado. Configuração copiada sem exibir. Cole SOMENTE no novo Environment Secret G1_DROPBOX_OAUTH_JSON.'
    Start-Process 'https://github.com/bonecodesign/salvamotoca/settings/environments'
    Write-Host 'No ambiente g1-backup-testes, crie G1_DROPBOX_OAUTH_JSON, cole e salve.'
    Write-Host 'Depois limpe o clipboard (inclusive histórico/sincronização do Windows, se ativos).'
} catch {
    Write-Host 'Preparação interrompida. Confira app, permissões, conta e código. Nenhuma resposta de API ou credencial será exibida.'
    exit 23
} finally {
    Remove-Variable secret,code,reply,json,meta -ErrorAction SilentlyContinue
}
