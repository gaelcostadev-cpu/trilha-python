$ErrorActionPreference = 'Stop'
$runtime = Join-Path $PSScriptRoot 'official-runtime'
$archive = Join-Path $PSScriptRoot 'python-3.14.10-embed-amd64.zip'
if (Test-Path -LiteralPath $runtime) { throw 'A pasta do runtime já existe. Preserve ou remova-a manualmente antes de preparar novamente.' }
if (Test-Path -LiteralPath $archive) { throw 'O arquivo de download já existe. Preserve ou remova-o manualmente antes de preparar novamente.' }
try {
  Invoke-WebRequest -Uri 'https://www.python.org/ftp/python/3.14.10/python-3.14.10-embed-amd64.zip' -OutFile $archive
  $actual = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actual -ne '90905e64a840557d8c1bc4f5b74db3d7ee85e3ffb217611cac1c7813acea4159') { throw 'A integridade do pacote Python não foi confirmada.' }
  Expand-Archive -LiteralPath $archive -DestinationPath $runtime
  Write-Output 'Runtime experimental preparado.'
} finally {
  if (Test-Path -LiteralPath $archive) { Remove-Item -LiteralPath $archive }
}
