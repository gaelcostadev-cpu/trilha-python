# Validação experimental de execução Python no Windows

Data: 6 de novembro de 2026. **Resultado histórico daquela etapa: a execução de código no Trilha Python estava desativada.** Os testes abaixo são evidência parcial em uma máquina Windows Professional, não uma certificação para Windows Home ou para o aplicativo distribuído.

## Ambiente

- Windows Professional, build 26200.9711.
- Electron 45.2.3, Node 24.22.2 e Microsoft MXC SDK 1.0.1 em uma área de teste separada.
- Python 3.14.10 oficial para Windows x64, obtido da Python Software Foundation. O pacote foi conferido contra o SHA-256 publicado: `90905e64a840557d8c1bc4f5b74db3d7ee85e3ffb217611cac1c7813acea4159`.
- O experimento não é o aplicativo e não executou código fornecido por estudantes.

## Resultados observados

1. Um AppContainer criado diretamente sem capacidades de rede iniciou uma cópia de teste do Python. O supervisor confirmou o token e o identificador do contêiner antes de retomar o processo. Um arquivo canário pôde ser lido no host, mas a leitura e a criação de arquivo foram negadas no contêiner. A conexão local expirou no contêiner, enquanto o controle no host conectou. Timeout e cancelamento encerraram os subprocessos observados.
2. O MXC selecionou o backend Windows `processcontainer`, nível `base-container`. Com caminhos de leitura restritos, ambiente explícito, rede negada e UI isolada no modo `container`, o Python oficial não pôde ler ou criar os arquivos canários, incluindo um canário temporário na pasta do projeto. O host pôde ler e criar esses arquivos.
3. Nos testes de rede local, os controles do host funcionaram para TCP e UDP, IPv4 e IPv6. O TCP isolado foi recusado. As chamadas UDP retornaram sucesso ao remetente, mas os serviços locais de teste não receberam os pacotes; isso **não comprova** bloqueio para todo destino externo.
4. Um serviço de gerenciamento WMI foi acessível pelo processo de controle, mas recusou a conexão do Python isolado com erro de acesso negado. Isso não prova que todo mecanismo COM ou intermediário esteja bloqueado.
5. Entrada e saída Unicode, exceção Python, limite de tempo, cancelamento e interrupção de saída excessiva funcionaram em um candidato experimental. Um supervisor fora do contêiner aplicou limites de memória e de processos antes de liberar o código; o processo isolado não conseguiu abrir o supervisor para duplicar recursos. A consulta DNS de controle funcionou no host e foi negada ao processo isolado. Os subprocessos observados desapareceram após timeout, cancelamento, término do processo principal e encerramento forçado do supervisor.
6. Uma configuração alternativa de interface Windows permitiu ler o texto de uma janela criada para o teste. Ela foi descartada. Com o modo mais restrito `container`, as duas tentativas usadas para ler a mesma janela falharam e os oito imports testados (`ctypes`, `sqlite3`, `ssl`, `socket`, `hashlib`, `decimal`, `asyncio` e `zipfile`) funcionaram. Isso não equivale a uma auditoria completa de acesso à interface.

## O que falta para liberar a execução

- Integrar e revisar um executor supervisionado no Electron e distribuir o runtime oficial de modo reproduzível, sem usar o Python pessoal como fallback. Um candidato experimental separado prepara o runtime oficial com verificação de hash, mas não está ligado ao aplicativo.
- Revisar a implementação dos limites de memória e processos no artefato final, garantir limpeza dos arquivos temporários após queda do supervisor e revisar todos os canais herdados. O SDK avaliado não expõe diretamente todas essas quotas; o experimento as aplicou por um Job Object no supervisor externo.
- Ampliar os testes de rede externa, DNS, UDP, arquivos e atalhos, pipes/IPC, COM e outros mecanismos de criação de processos. Testar a política e o artefato realmente distribuído, não apenas o experimento.
- Testar a versão instalada em Windows Home. A máquina disponível é Professional; a existência de APIs no Windows não prova seu comportamento em outra edição.

A documentação da Microsoft descreve [AppContainer e capacidades](https://learn.microsoft.com/en-us/windows/win32/secauthz/implementing-an-appcontainer) e o [SDK MXC](https://github.com/microsoft/mxc). Esses documentos sustentam o desenho dos testes, mas não substituem a validação do aplicativo.


## Ensaios adicionais de 6 de novembro

- Um pipe nomeado de teste aceitou conexão do processo de controle, mas recusou a conexão do processo isolado. Um ensaio COM específico não conseguiu criar o arquivo canário a partir do processo isolado; esses ensaios não abrangem todos os mecanismos de comunicação ou criação de processos.
- Um candidato separado passou o código por entrada padrão, sem gravá-lo deliberadamente em arquivo temporário. No teste de queda de sua variante anterior, o processo de teste terminou e o código não foi encontrado no diretório temporário inspecionado. Isso não exclui paginação, dumps ou outras cópias; a variante com travas ainda precisa repetir esse teste de queda.
- As travas experimentais recusaram alteração de arquivos abertos e rejeitaram links preexistentes nos casos testados. Um hardlink preexistente em diretório autorizado permitiu ler um canário privado em outro ensaio; com a trava ativa, uma tentativa específica de criar hardlink foi recusada, mas um arquivo comum ainda pôde ser criado. Os diretórios ancestrais e suas permissões ainda não estão suficientemente protegidos.
- Os testes com programas fixos verificaram entrada Unicode, importação de `__main__`, limite de saída UTF-8, timeout, cancelamento, memória e processos. A associação ao processo pelo PID ainda precisa ser comprovada contra reutilização, e faltam testes de falhas nativas e auditoria independente. O candidato permanece experimental e desconectado do aplicativo.

Naquela etapa, a ponte ainda recusava execução. Não havia validação no Windows Home nem no aplicativo instalado.

## Ensaios adicionais no Windows Pro

Em um perfil de teste sem credenciais, uma cópia portátil de verificação abriu uma janela e carregou conteúdo local. Não é validação de instalador nem da execução integrada. Um teste separado confirmou que um processo criado suspenso pode ser associado a um Job usando o handle retornado na criação antes de ser retomado; isso ainda não comprova a integração dessa técnica com o MXC.

No candidato com travas, controles positivos do host e canários sintéticos indicaram negação de leitura e escrita de arquivo, conexão TCP IPv4 local e externa a um único destino, pipe nomeado e conexão WMI. No teste UDP local, o envio retornou sucesso, mas o receptor não observou o pacote isolado; o resultado é inconclusivo e não prova bloqueio. Estes casos não abrangem todos os destinos, mecanismos de comunicação ou versões do Windows. O teste reproduzível `security-check.mjs` falha quando há resultado inconclusivo.

Um segundo ensaio sintético criou um intermediário suspenso, associou-o ao Job pelo handle original e confirmou que o processo MXC/PSEC vivo pertencia ao mesmo Job. O fechamento do último handle encerrou ambos. Casos de falha em três pontos do ensaio encerraram os processos observados. Isso é uma alternativa promissora à associação posterior por PID, mas ainda não demonstra imposição de todas as cotas, recuperação após queda abrupta, proteção contra ações adversariais ou segurança do executor integrado.

Com esse Job herdado, um programa fixo isolado não conseguiu abrir o supervisor para duplicar handles; o controle no host conseguiu. Uma alocação de 640 MiB passou com limite por processo de 1 GiB e foi recusada com limite de 512 MiB. Um subprocesso foi criado com limite de 16 processos, mas recusado com limite de 2. Em outro ensaio, o encerramento forçado do supervisor foi seguido pelo término dos dois processos observados. Os resultados valem somente para os cenários testados; não cobrem a cota agregada de memória, todos os escapes ou Windows Home. A observação do processo MXC ainda usa um handle aberto a partir do PID fornecido pelo SDK.

Outro ensaio, em uma pasta temporária exclusiva, confirmou controles positivos para hardlink e renomeação de diretório no host. Com a trava de diretório usada pelo protótipo, a criação de um arquivo comum ainda foi possível, enquanto uma tentativa de hardlink e a renomeação do ancestral testado foram recusadas. Um caminho com junction em um ancestral ainda foi seguido, mesmo com a opção de não seguir reparse point no componente final. Uma ACL negando criação impediu criar arquivo, mas o proprietário conseguiu restaurar a ACL e criar em seguida. Esses resultados não comprovam uma proteção completa contra alteração de caminhos ou contra outro processo do mesmo usuário.

## Escopo da próxima liberação

Em 7 de novembro de 2026, o projeto passou a priorizar a validação no Windows Pro sem aguardar um teste em Windows Home. A ausência de validação nessa edição, portanto, não é pré-requisito para uma versão limitada ao ambiente Windows Pro verificado; ela permanece uma limitação de compatibilidade. A ativação posterior ocorreu sem comprovação integral dessas condições.

Neste Windows Pro, um programa sintético consultou seu próprio token: o processo do host não estava em AppContainer, enquanto o processo PSEC da variante experimental estava em AppContainer e não tinha as três capabilities de rede `internetClient`, `internetClientServer` e `privateNetworkClientServer`. O teste não demonstra o comportamento de UDP ou do aplicativo final. O ensaio reproduzível está em `experiments/python-isolation/token-isolation.mjs` e usa dados fictícios.

## Liberação autorizada e integração no Windows Pro

A execução foi ativada antes da comprovação completa do isolamento e do encerramento dos processos. A integração usa o Python 3.14.10 incorporado, solicita AppContainer/PSEC com rede negada e exige conta ChatGPT validada online. O aplicativo verifica a prontidão antes de enviar o código ao processo isolado; tempo, saída e recursos possuem limites e o cancelamento é encaminhado ao supervisor.

Uma janela Electron com perfil e conta fictícios executou um programa com entrada e saída Unicode, verificou erro Python, tempo limite e cancelamento pela ponte real. O Windows Home, a instalação empacotada e todos os caminhos de rede e de arquivos não foram validados. Em falhas de encerramento, a proteção dos arquivos e o fim da árvore não têm garantia integral. Não interpretar os testes como certificação de segurança.
