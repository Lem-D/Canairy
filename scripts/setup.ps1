<#
Sets up the Canairy software (bridge + dashboard) on Windows.
Safe to re-run. Usage: .\scripts\setup.ps1 [-SkipTests]
If scripts are blocked, run once: Set-ExecutionPolicy -Scope Process Bypass
#>
param([switch]$SkipTests)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot

function Step($msg) { Write-Host "`n==> $msg" }
function Fail($msg) { Write-Host "ERROR: $msg" -ForegroundColor Red; exit 1 }
# Native commands don't throw on failure, so check the exit code ourselves.
function Check($what) { if ($LASTEXITCODE -ne 0) { Fail "$what failed (exit code $LASTEXITCODE)" } }

# --- Check prerequisites -----------------------------------------------------
Step 'Checking prerequisites'

$python = $null
foreach ($candidate in @(@('py', '-3'), @('python'), @('python3'))) {
  if (-not (Get-Command $candidate[0] -ErrorAction SilentlyContinue)) { continue }
  $extra = @($candidate | Select-Object -Skip 1)
  & $candidate[0] @extra -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)' 2>$null
  if ($LASTEXITCODE -eq 0) { $python = $candidate; break }
}
if (-not $python) { Fail 'Python 3.10 or newer not found. Install it from https://www.python.org/downloads/' }
$pyExe = $python[0]
$pyArgs = @($python | Select-Object -Skip 1)
Write-Host ("Python: " + (& $pyExe @pyArgs --version))

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Fail 'Node.js 18 or newer not found. Install it from https://nodejs.org/' }
$nodeMajor = [int](node -p 'process.versions.node.split(".")[0]')
if ($nodeMajor -lt 18) { Fail "Node.js 18 or newer required, found $(node -v). Install it from https://nodejs.org/" }
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { Fail 'npm not found. It normally comes with Node.js: https://nodejs.org/' }
Write-Host "Node:   $(node -v), npm $(npm -v)"

# --- Bridge ------------------------------------------------------------------
Step 'Setting up the bridge (Python virtual environment)'
Set-Location (Join-Path $Root 'bridge')
$venvPython = Join-Path (Get-Location) '.venv\Scripts\python.exe'
# A half-created venv has no pip, so treat that as "not created".
if (Test-Path '.venv') {
  & $venvPython -m pip --version *> $null
  if ($LASTEXITCODE -ne 0) {
    Write-Host 'Existing virtual environment is broken, recreating it'
    Remove-Item -Recurse -Force '.venv'
  }
}
if (-not (Test-Path '.venv')) {
  & $pyExe @pyArgs -m venv .venv
  if ($LASTEXITCODE -ne 0) {
    if (Test-Path '.venv') { Remove-Item -Recurse -Force '.venv' }
    Fail 'Could not create the virtual environment'
  }
} else {
  Write-Host 'Virtual environment already exists, reusing it'
}
& $venvPython -m pip install --quiet --disable-pip-version-check -r requirements.txt
Check 'Installing bridge dependencies'
Write-Host 'Bridge dependencies installed'

# --- Dashboard ---------------------------------------------------------------
Step 'Setting up the dashboard (npm packages)'
Set-Location (Join-Path $Root 'canairy-dashboard')
npm ci --no-audit --no-fund
Check 'npm ci'

# --- Tests -------------------------------------------------------------------
if (-not $SkipTests) {
  Step 'Running tests'
  Set-Location (Join-Path $Root 'bridge')
  & $venvPython -m unittest
  Check 'Bridge tests'
  Set-Location (Join-Path $Root 'canairy-dashboard')
  $env:CI = 'true'
  npm test
  Check 'Dashboard tests'
}

Write-Host @'

Setup complete. To run Canairy (two terminals):

  1) cd bridge; .venv\Scripts\activate; python bridge.py --no-serial
  2) cd canairy-dashboard; npm start

Then open http://localhost:3000
'@
