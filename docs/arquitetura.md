# Decisões e evidências

## Limites entre processos

O renderer acessa uma ponte restrita; o processo principal valida entradas e controla o armazenamento, as URLs externas e a integração com ChatGPT. A sessão OAuth é separada do SQLite e protegida com `safeStorage`. O núcleo de aprendizagem é puro e não está ligado a um executor Python. SQLite é mantido em memória por sql.js e persistido como arquivo por substituição; testes cobrem reabertura de dados, não queda de energia.

A autorização usa o fluxo oficial OAuth/OIDC de aplicativo aberto, com PKCE e verificação da identidade, enquanto o professor envia somente o contexto da conversa selecionada. O catálogo de modelos é validado online ao iniciar, mas a elegibilidade de inferência só é demonstrada pela chamada real. A execução arbitrária de Python permanece desativada até se comprovar o isolamento.

## Avaliação

A compilação e os testes automatizados incluem regras de domínio, SQLite, árvore, formação de contexto e simulações de autorização e streaming. A janela Electron foi aberta no Windows build 26200. Login e resposta foram verificados com uma conta ChatGPT real. Acessibilidade completa, Windows Home e recuperação após falha de energia ainda precisam de verificação.

## ECC: classificação inicial

DAILY candidatos: padrões TypeScript/React e segurança Electron, fundamentados em `package.json`, `src/renderer` e `src/main`. LIBRARY: Python testing, acessibilidade, segurança, autenticação e SQLite, acionados por tarefa. Isto é inventário inicial, não auditoria exaustiva nem instalação automática de hooks.

