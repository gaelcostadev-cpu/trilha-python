# Experimento de isolamento Python

**Experimento de desenvolvimento: não está integrado ao aplicativo e não está aprovado para executar código de estudantes.** A execução no Trilha Python permanece bloqueada. Os testes usam apenas programas fixos e canários criados pelo próprio experimento.

O candidato usa Microsoft MXC 1.0.1 com `processcontainer`, uma política explícita de rede e arquivos, e um Job Object controlado pelo processo supervisor. O Python aguarda um sinal antes de carregar o programa; o supervisor só o envia após configurar e associar os limites de recursos. Se qualquer passo falhar, não há fallback sem isolamento.

## Preparar

No Windows x64, com Node/npm e as dependências do projeto principal instaladas:

```powershell
cd experiments\python-isolation
npm ci
.\setup-runtime.ps1
.\run-tests.ps1
```

A preparação baixa o pacote oficial Python 3.14.10 para Windows x64 e confere o SHA-256 antes de extraí-lo. As dependências de teste e o runtime não são incluídos no Git. O experimento usa o Electron instalado pelo projeto principal como motor Node.

Os testes verificam entrada e saída, erros, timeout, cancelamento, limite de saída, memória e processos, acesso ao supervisor, uma variável fictícia, arquivo de teste, conexão local e acesso WMI. O teste WMI é somente de conexão; nenhum processo é criado por ele. Os resultados ficam nesta pasta e não devem ser enviados sem revisão: podem conter caminhos locais e identificadores de processo.

## Limites conhecidos

Ainda faltam auditoria independente do código final, testes de falha em cada etapa, garantias de integridade do runtime instalado e limpeza após queda do aplicativo. Também faltam testes mais amplos de rede externa, arquivos, links, interface, IPC e criação de processos por intermediários, além de validação com o aplicativo instalado em Windows Home. O teste de uma política ou da presença de MXC não substitui testes do artefato final. Não exponha este candidato ao editor até que essas verificações estejam concluídas.

As regras experimentais são específicas de Windows x64; se a plataforma ou o nível de isolamento exigido não estiver disponível, a execução falha. Consulte [Microsoft MXC](https://github.com/microsoft/mxc) e a [versão oficial do Python](https://www.python.org/downloads/release/python-31410/).

## Variante com travas e código em memória

A variante mais recente e seus testes fixos estão descritos em [LOCKED-CANDIDATE.md](LOCKED-CANDIDATE.md). Ela continua experimental e não deve executar código real. A variante anterior `broker-runner.mjs` pode deixar o programa em arquivo temporário após queda do supervisor; não use código particular nos ensaios.

## Testes adicionais do isolamento

`run-tests.ps1` também executa os testes da variante com travas. Para comparar o acesso do host e do processo isolado a canários de arquivo, TCP, pipe nomeado e WMI, execute separadamente, nesta pasta, com Node compatível com o SDK:

```powershell
node security-check.mjs . --external
```

O teste externo faz somente uma conexão de controle a `1.1.1.1:443`. Sem `--external`, o teste de rede externa fica bloqueado e o comando retorna falha. Para UDP, ausência de pacote recebido sem negação explícita é inconclusiva; qualquer caso inconclusivo também retorna falha. A saída pode conter caminhos locais: revise-a antes de compartilhar. Os testes não liberam o uso de código real.
