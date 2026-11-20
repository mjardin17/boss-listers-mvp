param(
  [Parameter(Mandatory = $true)]
  [ValidateNotNullOrEmpty()]
  [string]$WorkspaceId
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$managedEnvNames = @("SUPABASE_URL", "SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY")
$previousEnv = @{}
foreach ($name in $managedEnvNames) { $previousEnv[$name] = [Environment]::GetEnvironmentVariable($name) }

if ($WorkspaceId -notmatch "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$") {
  throw "WorkspaceId must be the UUID of the BossListers tenant that owns this local Card Factory."
}

$envFiles = @(".env.local", ".env.production.local", ".env") | ForEach-Object { Join-Path $repoRoot $_ } | Where-Object { Test-Path $_ }
function Get-ConfiguredValue([string]$Name) {
  $current = [Environment]::GetEnvironmentVariable($Name)
  if (-not [string]::IsNullOrWhiteSpace($current)) { return $current }
  foreach ($file in $envFiles) {
    $match = Select-String -Path $file -Pattern "^\s*$([regex]::Escape($Name))\s*=(.*)$" | Select-Object -First 1
    if ($match) {
      $value = $match.Matches[0].Groups[1].Value.Trim()
      if ($value.Length -ge 2 -and (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'")))) {
        $value = $value.Substring(1, $value.Length - 2)
      }
      return $value
    }
  }
  return $null
}

$supabaseUrl = Get-ConfiguredValue "SUPABASE_URL"
$supabaseAnon = Get-ConfiguredValue "SUPABASE_ANON_KEY"
$publicSupabaseUrl = Get-ConfiguredValue "NEXT_PUBLIC_SUPABASE_URL"
$publicSupabaseAnon = Get-ConfiguredValue "NEXT_PUBLIC_SUPABASE_ANON_KEY"
if (($publicSupabaseUrl -and $publicSupabaseUrl -ne $supabaseUrl) -or ($publicSupabaseAnon -and $publicSupabaseAnon -ne $supabaseAnon)) {
  throw "NEXT_PUBLIC Supabase settings must match SUPABASE_URL and SUPABASE_ANON_KEY."
}
if ([string]::IsNullOrWhiteSpace($supabaseUrl) -or [string]::IsNullOrWhiteSpace($supabaseAnon)) {
  throw "Desktop authentication requires SUPABASE_URL and SUPABASE_ANON_KEY. Use the publishable/anon key only, never a service-role key."
}
$env:SUPABASE_URL = $supabaseUrl
$env:SUPABASE_ANON_KEY = $supabaseAnon
$env:NEXT_PUBLIC_SUPABASE_URL = $supabaseUrl
$env:NEXT_PUBLIC_SUPABASE_ANON_KEY = $supabaseAnon

$requiredSettings = @("APP_BASIC_AUTH_USER", "APP_BASIC_AUTH_PASS", "GEMINI_API_KEY")
foreach ($setting in $requiredSettings) {
  if ([string]::IsNullOrWhiteSpace((Get-ConfiguredValue $setting))) {
    throw "Desktop production mode requires $setting in .env.local (or the process environment). The value is not displayed."
  }
}

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

$dataDir = $env:CARD_FACTORY_LOCAL_DATA_DIR
New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
$windowsIdentity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
& icacls $dataDir /inheritance:r /grant:r "$($windowsIdentity):(OI)(CI)F" /T /C | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Could not restrict Card Factory data-folder permissions to the current Windows account." }

$service = $null
try {
  $service = Start-Process -FilePath "node" -ArgumentList "scripts/card-factory-local/server.mjs" -WorkingDirectory $repoRoot -NoNewWindow -PassThru
  $serviceReady = $false
  for ($attempt = 0; $attempt -lt 10; $attempt++) {
    if ($service.HasExited) { break }
    try {
      $health = Invoke-RestMethod -Uri "http://127.0.0.1:8787/health" -TimeoutSec 2
      if ($health.ok -eq $true) { $serviceReady = $true; break }
    } catch {
      Start-Sleep -Seconds 1
    }
  }
  if (-not $serviceReady) {
    throw "The local Card Factory service did not become healthy on 127.0.0.1:8787. Check whether the port is already in use and review the service error above."
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
  foreach ($name in $managedEnvNames) {
    if ($null -eq $previousEnv[$name]) {
      Remove-Item "Env:$name" -ErrorAction SilentlyContinue
    } else {
      [Environment]::SetEnvironmentVariable($name, $previousEnv[$name], "Process")
    }
  }
}
