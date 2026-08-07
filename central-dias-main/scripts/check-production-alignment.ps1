Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Read-GitValue {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Command
  )

  return (& powershell -NoProfile -Command $Command).Trim()
}

function Write-Section {
  param([string]$Title)
  Write-Host ""
  Write-Host "== $Title ==" -ForegroundColor Cyan
}

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

git fetch origin | Out-Null

$currentBranch = (git branch --show-current).Trim()
$headCommit = (git rev-parse HEAD).Trim()
$originMain = (git rev-parse origin/main).Trim()
$workingTree = git status --short

$envPath = Join-Path $repoRoot ".env"
$requiredEnvNames = @(
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_ANON_KEY",
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY"
)

$envMap = @{}
if (Test-Path $envPath) {
  foreach ($line in Get-Content $envPath) {
    if ($line -match "^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$") {
      $envMap[$matches[1]] = $matches[2]
    }
  }
}

Write-Section "Git"
Write-Host "Branch atual: $currentBranch"
Write-Host "HEAD: $headCommit"
Write-Host "origin/main: $originMain"

if ($headCommit -eq $originMain) {
  Write-Host "Alinhamento com producao GitHub: OK" -ForegroundColor Green
} else {
  Write-Host "Alinhamento com producao GitHub: DIVERGENTE" -ForegroundColor Yellow
}

if ([string]::IsNullOrWhiteSpace(($workingTree -join ""))) {
  Write-Host "Working tree: limpa" -ForegroundColor Green
} else {
  Write-Host "Working tree: com alteracoes pendentes" -ForegroundColor Yellow
  $workingTree
}

Write-Section "Ambiente local"
if (Test-Path $envPath) {
  Write-Host ".env local: presente" -ForegroundColor Green
} else {
  Write-Host ".env local: ausente" -ForegroundColor Yellow
}

foreach ($envName in $requiredEnvNames) {
  $value = ""
  if ($envMap.ContainsKey($envName)) {
    $value = [string]$envMap[$envName]
  }

  if ([string]::IsNullOrWhiteSpace($value)) {
    Write-Host "${envName}: ausente" -ForegroundColor Yellow
  } else {
    Write-Host "${envName}: ok" -ForegroundColor Green
  }
}

Write-Section "Supabase"
Write-Host "Migrations locais: $(Get-ChildItem .\supabase\migrations\*.sql | Measure-Object | Select-Object -ExpandProperty Count)"
Write-Host "Arquivo mais recente: $((Get-ChildItem .\supabase\migrations\*.sql | Sort-Object Name | Select-Object -Last 1).Name)"

Write-Section "Resumo"
if ($headCommit -eq $originMain -and [string]::IsNullOrWhiteSpace(($workingTree -join ""))) {
  Write-Host "Repositorio pronto para operar alinhado com a branch de producao." -ForegroundColor Green
} else {
  Write-Host "Ha divergencias antes da publicacao. Revise branch, push ou arquivos locais." -ForegroundColor Yellow
}
