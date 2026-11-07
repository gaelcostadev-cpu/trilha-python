$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$source = Join-Path $root 'official-runtime'
$target = Join-Path $root 'safe-launcher\official-runtime'
if (-not (Test-Path -LiteralPath (Join-Path $root 'node_modules\@microsoft\mxc-sdk')) -or -not (Test-Path -LiteralPath (Join-Path $root 'node_modules\koffi'))) {
  npm ci --prefix $root
  if ($LASTEXITCODE -ne 0) { throw 'Não foi possível instalar as dependências do executor.' }
}
if (-not (Test-Path -LiteralPath (Join-Path $source 'python.exe'))) {
  & (Join-Path $root 'setup-runtime.ps1')
}
if (-not (Test-Path -LiteralPath $target)) {
  Copy-Item -LiteralPath $source -Destination $target -Recurse
}
if (-not (Test-Path -LiteralPath (Join-Path $target 'python.exe'))) { throw 'O Python incorporado não está disponível.' }
Write-Output 'Ambiente Python preparado. A integridade será verificada ao executar.'
