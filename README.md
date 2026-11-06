# Trilha Python

Prévia open source de uma escola de programação para Windows, construída com Electron, TypeScript, React e SQLite. **O aplicativo ainda está em desenvolvimento e não oferece uma jornada completa.**

## Executar

Instale Node.js compatível com as dependências do `package-lock.json` e, no Windows, execute:

```powershell
npm ci
npx install-electron --no
npm start
```

A instalação requer acesso à internet. `npm run build` verifica tipos e compila; `npm test` executa os testes automatizados.

## Professor com ChatGPT

Em Configurações, entre com uma conta ChatGPT elegível e autorize o uso do plano. O fluxo usa [Sign in with ChatGPT para aplicações open source](https://developers.openai.com/siwc/token-sharing-open-source), sem chave de API. A sessão é armazenada separadamente com a proteção do Windows (`safeStorage`). O app consulta o serviço ao abrir; a resposta real depende também da elegibilidade, das políticas e dos limites da conta.

O chat tem conversas gerais e por atividade, três estilos de orientação e dicas locais progressivas. Ao enviar uma mensagem, o app envia à OpenAI a mensagem, o estilo selecionado, até seis mensagens recentes do mesmo contexto e, no chat da atividade, o respectivo enunciado. O código do editor não é enviado automaticamente. Conversas e configurações ficam no SQLite local. A página de configurações do ChatGPT pode ser aberta no aplicativo.

O login, a reabertura da sessão e uma resposta do professor foram verificados com uma conta elegível. Os testes de erros, limites de uso e cancelamento usam simulações; consultar o catálogo de modelos não garante que toda inferência será aceita. A versão atual mantém apenas uma conexão de conta por instalação.

## O que ainda falta

- Distribuir Python e comprovar o isolamento AppContainer no Windows Home, incluindo rede, arquivos pessoais, cancelamento e tempo limite. A execução de código está bloqueada até essa comprovação.
- Ligar atividade, prova, diagnóstico, revisão e conquista a resultados confiáveis e persistir o progresso. Os testes atuais do domínio usam resultados simulados; a prova de funções exige uma verificação estrutural ainda inexistente.
- Implementar inicialização com Windows, dias de estudo recorrentes, notificações, personagens evolutivos e itens equipáveis.
- Importar, deduplicar, traduzir e vincular as cinco fontes externas, após conferir direitos e condições. Nenhuma foi importada nesta prévia. Veja [fontes e pesquisa](docs/fontes-e-pesquisa.md).
- Testar a navegação por teclado e a acessibilidade de ponta a ponta, criar instalador e validar o aplicativo no Windows Home.

## Licença

O código original está sob a [licença MIT](LICENSE). Os direitos das fontes externas são tratados separadamente em [fontes e pesquisa](docs/fontes-e-pesquisa.md).

