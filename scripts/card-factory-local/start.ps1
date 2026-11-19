param(
  [Parameter(Mandatory = $true)]
  [ValidateNotNullOrEmpty()]
  [string]$WorkspaceId
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path

$nodeVersionText = & node -p "process.versions.node"
if ($LASTEXITCODE -ne 0) {
  throw "Node.js is not installed or is not available on PATH."
}
$nodeVersion = [version]$nodeVersionText
if ($nodeVersion -lt [version]"22.13.0") {
  throw "Node.js 22.13 or newer is required. Found $nodeVersionText."
}
if (-not (Test-Path (Join-Path $repoRoot "node_modules"))) {
  throw "Dependencies are missing. Run npm install in the repository first."
}

$token = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
$env:CARD_FACTORY_LOCAL_TOKEN = $token
$env:CARD_FACTORY_LOCAL_WORKSPACE_ID = $WorkspaceId.Trim()
$env:CARD_FACTORY_LOCAL_DATA_DIR = Join-Path $env:LOCALAPPDATA "BossListers\CardFactory"
$env:CARD_FACTORY_LOCAL_HOST = "127.0.0.1"
$env:CARD_FACTORY_LOCAL_PORT = "8787"
$env:CARD_FACTORY_LOCAL_BRIDGE_ENABLED = "true"

$service = $null
try {
  $service = Start-Process -FilePath "node" -ArgumentList "scripts/card-factory-local/server.mjs" -WorkingDirectory $repoRoot -NoNewWindow -PassThru
  Start-Sleep -Seconds 1
  if ($service.HasExited) {
    throw "The local Card Factory service stopped during startup. Review the error above."
  }

  Write-Host "Local Card Factory is running on loopback port 8787."
  Write-Host "Building the authenticated BossListers desktop server."
  npm run build
  if ($LASTEXITCODE -ne 0) { throw "BossListers production build failed." }
  Write-Host "Starting the BossListers production server on port 3001."
  Write-Host "For iPhone access, use a trusted HTTPS tunnel to port 3001 only; never expose port 8787."
  npm run start:card-factory-local
}
finally {
  if ($service -and -not $service.HasExited) {
    Stop-Process -Id $service.Id -Force -ErrorAction SilentlyContinue
  }
  Remove-Item Env:CARD_FACTORY_LOCAL_TOKEN -ErrorAction SilentlyContinue
  Remove-Item Env:CARD_FACTORY_LOCAL_WORKSPACE_ID -ErrorAction SilentlyContinue
  Remove-Item Env:CARD_FACTORY_LOCAL_DATA_DIR -ErrorAction SilentlyContinue
  Remove-Item Env:CARD_FACTORY_LOCAL_HOST -ErrorAction SilentlyContinue
  Remove-Item Env:CARD_FACTORY_LOCAL_PORT -ErrorAction SilentlyContinue
  Remove-Item Env:CARD_FACTORY_LOCAL_BRIDGE_ENABLED -ErrorAction SilentlyContinue
}
