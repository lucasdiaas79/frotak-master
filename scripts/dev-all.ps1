$ErrorActionPreference = "Stop"

$repo = Split-Path -Parent $PSScriptRoot
$root = Join-Path $repo "frotak-central"
$client = Join-Path $repo "frotak-tms"

Write-Host "FrotaK Central (Master): http://127.0.0.1:5173"
Write-Host "FrotaK TMS (cliente):    http://127.0.0.1:5174"

$masterJob = Start-Job -Name "frotak-master" -ScriptBlock {
  param($Path)
  Set-Location $Path
  npm run dev -- --host 127.0.0.1 --port 5173
} -ArgumentList $root

$clientJob = Start-Job -Name "frotak-client" -ScriptBlock {
  param($Path)
  Set-Location $Path
  npm run dev -- --host 127.0.0.1 --port 5174
} -ArgumentList $client

try {
  Receive-Job -Job $masterJob, $clientJob -Wait
} finally {
  Stop-Job -Job $masterJob, $clientJob -ErrorAction SilentlyContinue
  Remove-Job -Job $masterJob, $clientJob -ErrorAction SilentlyContinue
}
