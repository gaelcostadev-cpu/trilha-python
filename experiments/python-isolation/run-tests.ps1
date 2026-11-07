$ErrorActionPreference = 'Stop'
$electron = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\node_modules\electron\dist\electron.exe'))
if (-not (Test-Path -LiteralPath $electron)) { throw 'Instale as dependências do projeto principal antes dos testes.' }
if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'official-runtime\python.exe'))) { throw 'Prepare o runtime com setup-runtime.ps1.' }
if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'node_modules\@microsoft\mxc-sdk'))) { throw 'Execute npm ci nesta pasta antes dos testes.' }
$previous = $env:ELECTRON_RUN_AS_NODE
try {
  $env:ELECTRON_RUN_AS_NODE = '1'
  & node --test (Join-Path $PSScriptRoot 'tests\lock-runtime.test.mjs') (Join-Path $PSScriptRoot 'security-verdicts.test.mjs')
  if ($LASTEXITCODE -ne 0) { throw 'Falha nos testes de integridade e travas.' }
  foreach ($test in @('broker-tests.mjs', 'broker-security-tests.mjs', 'broker-isolation.mjs', 'broker-wmi.mjs', 'locked-memory-tests.mjs', 'locked-memory-security-tests.mjs', 'locked-live-test.mjs')) {
    $script = Join-Path $PSScriptRoot $test
    $process = Start-Process -FilePath $electron -ArgumentList @('"' + $script + '"') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -Wait -PassThru
    if ($process.ExitCode -ne 0) { throw "Falha em $test. Consulte o resultado local." }
  }
  & $electron (Join-Path $PSScriptRoot 'token-isolation.mjs') | Out-Host
  if ($LASTEXITCODE -ne 0) { throw 'Falha no teste de permissões de rede.' }
  $basic = Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'broker-tests.json') | ConvertFrom-Json
  $resources = Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'broker-security-tests.json') | ConvertFrom-Json
  if (@($basic.tests | Where-Object { -not $_.ok }).Count -or @($resources.tests | Where-Object { -not $_.ok }).Count) { throw 'Um dos testes de execução ou de recursos falhou.' }
  $isolation = Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'broker-isolation-result.json') | ConvertFrom-Json
  if (-not $isolation.hostRead -or -not $isolation.hostLoopback -or $isolation.secretPresent -or $isolation.read -ne 'PermissionError' -or $isolation.network -ne 'PermissionError') { throw 'Um dos testes de isolamento falhou.' }
  $wmi = Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'broker-wmi-result.json') | ConvertFrom-Json
  $hostResult = $wmi.host.stdout | ConvertFrom-Json
  $sandboxResult = $wmi.sandbox.stdout | ConvertFrom-Json
  if ($wmi.host.status -ne 0 -or $hostResult.connect -ne 0 -or $sandboxResult.connect -ne -2147024891) { throw 'O teste WMI foi inconclusivo ou falhou.' }
  Write-Output 'Testes das variantes antiga e com travas passaram. Isso não libera a execução no aplicativo.'
} finally {
  $env:ELECTRON_RUN_AS_NODE = $previous
}
