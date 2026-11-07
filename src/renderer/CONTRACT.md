# Contrato do renderer

O preload expõe `window.school`, com os tipos em `types.ts`. Cada habilidade contém `activityId` e `prompt` da primeira atividade. Cada operação retorna o estado completo persistido. Erros devem rejeitar a promessa com uma mensagem legível; o renderer não cria progresso, mensagens ou dados fictícios.

- `getState()` carrega o estado.
- `saveCode(activityId, code)` salva um rascunho local.
- `setCalendar(date, status)` salva a data local (`YYYY-MM-DD`); `none` remove o registro.
- `signIn()` e `signOut()` refletem o estado real da conta e retornam o estado completo.
- `setPersonality(value)` persiste o estilo `acolhedor`, `direto` ou `socratico` e retorna o estado completo.
- `resumeTeacher()` retoma solicitações após pausa por limite de uso, somente por ação explícita.
- `dismissTeacherWelcome()` registra a confirmação do aviso de uso do plano.
- `sendMessage(scope, text, lessonId?)` envia uma mensagem somente com integração real. Enquanto indisponível, rejeita com erro legível sem gravar nada.

`onlineValidated` só é verdadeiro após validação online do acesso ao catálogo da conta, o que não garante uma resposta de inferência. A interface pode exibir a trilha em prévia; o professor requer uma conta autenticada e validação online. A disponibilidade da execução é informada por `runtimeStatus()`. Falhas de integração são exibidas sem criar dados ou respostas.

A execução usa `runtimeStatus()` para confirmar a disponibilidade e o motivo; caso a verificação falhe, permanece indisponível. `runPython(code, input)` executa no ambiente isolado e retorna `reason`, `exitCode` quando disponível, `stdout` e `stderr`. Os motivos são `completed`, `cancelled`, `timeout` e `output_limit`; `completed` com código de saída diferente de zero representa erro do programa. `cancelPython()` solicita o cancelamento e retorna se havia uma execução a cancelar. A interface cancela ao sair da habilidade; somente o processo principal pode validar os limites e garantir o isolamento.
