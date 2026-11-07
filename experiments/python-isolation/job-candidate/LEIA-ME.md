# Experimento isolado: Job herdado e casos sintéticos

**Não integrar ao aplicativo nem executar código de alunos.** Este diretório é uma prova, não um executor pronto. Os únicos casos aceitos por `run.py` e `helper.mjs` são `io`, `failure`, `flood`, `unicode_flood` e `hang`; `payload.py` contém esses programas fixos. Não existe interface para fornecer código de aluno. Esses arquivos, bem como seus caminhos e dependências, continuam alteráveis por quem tiver acesso ao espaço de trabalho.

O supervisor cria um Job com encerramento no fechamento do último handle e limites de processos e memória. Inicia o intermediário Electron suspenso, associa o handle original do processo ao Job, verifica a associação e só então retoma. O intermediário inicia o Python pelo MXC/PSEC; os limites são herdados conforme os ensaios separados em `../job-proof/RESULTADOS.md`. A coleta limita a saída combinada a 65.536 bytes, solicita o encerramento ao exceder o limite e grava um relatório com criação exclusiva, lido após o encerramento do intermediário. O supervisor espera até 12 segundos, fecha o Job e usa apenas o handle original do intermediário para encerramento forçado caso necessário. O Job também fecha se o supervisor morrer, desde que não existam outras cópias do handle.

## Reprodução observada

Windows 10.0.26200.0, Electron 45.2.3, MXC SDK 1.0.1 e Python incorporado 3.14.10, com acesso à criação do PSEC. No PowerShell, a partir da pasta experiments/python-isolation:

```powershell
$env:TRILHA_ELECTRON=(Resolve-Path ../../node_modules/electron/dist/electron.exe).Path
$env:TRILHA_MXC_ROOT=(Resolve-Path .).Path
$env:TRILHA_JOB_PROOF=(Resolve-Path job-proof).Path
python -O -B job-candidate/run.py
```

Saída: `PASS: pre-resume failure, fixed stdin/stdout/stderr, exception, output cap, UTF-8 boundary, timeout`. O teste cobre falha antes de retomar o intermediário, entrada fixa, saída UTF-8 e erro padrão com CRLF, exceção de Python, enchimento de saída, corte de caractere UTF-8 e timeout. Também foi verificado que `verify(False, ...)` falha sob `python -O`. Sem acesso ao PSEC no ambiente restrito, a criação falhou com HRESULT `0x800706D9`; isso é uma falha fechada, não evidência de funcionamento naquela configuração. As três variáveis são obrigatórias: `TRILHA_ELECTRON` aponta para o executável; `TRILHA_MXC_ROOT` aponta para um diretório com `node_modules/@microsoft/mxc-sdk` e `official-runtime/python.exe`; `TRILHA_JOB_PROOF` aponta para o diretório que contém `proof.py`. O candidato depende desse último arquivo externo para as primitivas e limpeza de Job.

## Limitações e revisão necessária

- O resultado não comprova isolamento contra programas adversariais. Em particular UDP, outros caminhos de rede e IPC, sistema de arquivos, processos e interfaces do Windows não foram exaustivamente testados aqui. Não inferir bloqueio de UDP dos resultados de outros testes.
- O runtime, SDK, Electron, scripts e diretórios não têm integridade ou ACLs verificadas neste experimento; alterações por outro processo podem mudar o programa executado ou seus privilégios. A pasta temporária e o arquivo de resultado não são um canal autenticado contra processos da mesma conta. Não há protocolo para enviar código ou resultados confiáveis ao aplicativo.
- O supervisor verifica o handle original do intermediário antes da retomada. O identificador fornecido pelo SDK para o Python não é um handle original; este candidato não verifica individualmente o processo Python. A evidência de associação do Python no ensaio anterior abre um handle depois de consultar o PID e, portanto, não elimina reutilização de PID ou todas as corridas. Não usar PID posterior para encerrar processos.
- O limite de 64 KiB conta bytes capturados antes da conversão e limita também os bytes UTF-8 combinados dos textos devolvidos. Um caractere cortado ou uma sequência inválida pode ser substituída ou descartada; o JSON pode ser maior que 64 KiB. O experimento não implementa terminal interativo, cancelamento pelo usuário ou controle de pressão de entrada. Erros síncronos de `child.kill()` e `dispose()` são reportados; o Job e o prazo externo são a retaguarda, não uma prova de limpeza correta em falhas nativas ou assíncronas.
- A limpeza tenta fechar o Job e encerrar o intermediário pelo handle original mesmo quando uma etapa falha; pode reportar uma exceção de limpeza sobre a causa inicial. Falhas do kernel, bloqueio do sistema de arquivos, exclusão da pasta temporária, vazamentos de handles e fechamento de streams sob falhas reais não foram esgotados. Não foi medido limite de CPU, disco ou consumo agregado de memória neste candidato.
- A execução foi verificada somente nesta máquina; Windows Home, outras versões/configurações, instalação empacotada e ausência de privilégios não foram validados. Não concluir que as restrições MXC/Job são suficientes para implantação.

Antes de qualquer integração ao aplicativo, revisar novamente `run.py`, `helper.mjs` e `payload.py`, repetir os testes locais e os controles de `../job-proof`, e resolver as limitações acima com evidências para a configuração de distribuição. A decisão de executar código não confiável exige uma avaliação de segurança separada.
