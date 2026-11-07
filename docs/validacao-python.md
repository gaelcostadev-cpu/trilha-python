# Validação experimental de execução Python no Windows

Data: 6 de novembro de 2026. **Resultado: a execução de código no Trilha Python continua desativada.** Os testes abaixo são evidência parcial em uma máquina Windows Professional, não uma certificação para Windows Home ou para o aplicativo distribuído.

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
5. Entrada e saída Unicode, exceção Python, limite de tempo, cancelamento e interrupção de saída excessiva funcionaram em um candidato experimental. Os subprocessos observados desapareceram após timeout, cancelamento e término do processo principal.
6. Uma configuração alternativa de interface Windows permitiu ler o texto de uma janela criada para o teste. Ela foi descartada. Com o modo mais restrito `container`, as duas tentativas usadas para ler a mesma janela falharam e os oito imports testados (`ctypes`, `sqlite3`, `ssl`, `socket`, `hashlib`, `decimal`, `asyncio` e `zipfile`) funcionaram. Isso não equivale a uma auditoria completa de acesso à interface.

## O que falta para liberar a execução

- Integrar um executor supervisionado ao Electron e distribuir o runtime oficial de modo reproduzível, sem usar o Python pessoal como fallback.
- Limitar memória e quantidade de processos, garantir limpeza após queda do supervisor e revisar todos os canais herdados e a gestão de arquivos temporários. O SDK avaliado não expõe diretamente todas essas quotas na API analisada.
- Ampliar os testes de rede externa, DNS, UDP, arquivos e atalhos, pipes/IPC, COM e outros mecanismos de criação de processos. Testar a política e o artefato realmente distribuído, não apenas o experimento.
- Testar a versão instalada em Windows Home. A máquina disponível é Professional; a existência de APIs no Windows não prova seu comportamento em outra edição.

A documentação da Microsoft descreve [AppContainer e capacidades](https://learn.microsoft.com/en-us/windows/win32/secauthz/implementing-an-appcontainer) e o [SDK MXC](https://github.com/microsoft/mxc). Esses documentos sustentam o desenho dos testes, mas não substituem a validação do aplicativo.
