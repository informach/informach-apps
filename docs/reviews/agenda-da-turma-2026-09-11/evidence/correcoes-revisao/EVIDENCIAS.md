# Evidências das correções F01–F10

Execuções de 11/09/2026, horário de São Paulo (UTC−3), após as alterações funcionais. Ambiente: Windows, PostgreSQL local, Next.js 16.2.6, Edge em 390 × 844. Não houve implantação. As saídas preservadas contêm dados sintéticos e não incluem credenciais, cookies, OTPs ou recados reais.

## Testes do app

[Saída completa](unit.log.txt).

```text
VERIFICATION REPORT
-------------------
Claim: A suite unitária da Agenda da Turma passou.
Command: pnpm --filter @informach/agenda-da-turma test
Executed: 2026-09-11 23:35:09–23:35:13 America/Sao_Paulo
Exit code: 0
Output summary: Test Files 36 passed (36); Tests 482 passed (482); Duration 4.05s.
Warnings: none
Errors: none
Verdict: PASS
```

## Integração

[Saída completa](integration.log.txt). Os 17 testes novos exercitam os serviços/repositórios reais e transações controladas, incluindo todos os IDs da revisão. Os outros 16 cobrem o fluxo familiar e admissão/recuperação de importações. E-mails ficam em memória, assinaturas são registros sintéticos locais.

```text
VERIFICATION REPORT
-------------------
Claim: Integração existente e regressões das correções passaram em PostgreSQL local.
Command: pnpm --filter @informach/agenda-da-turma test:integration
Executed: 2026-09-11 23:35:25–23:35:43 America/Sao_Paulo
Exit code: 0
Output summary: review-regressions.test.ts (17 tests); family-routine.test.ts (12 tests); notice-admission.test.ts (4 tests); Test Files 3 passed (3); Tests 33 passed (33).
Warnings: Provedor de e-mail, Stripe e dispositivos reais não foram acionados por estes testes.
Errors: none
Verdict: PASS
```

## Pacotes compartilhados

[Saída completa](shared-tests.log.txt).

```text
VERIFICATION REPORT
-------------------
Claim: As suites de autenticação, billing e e-mails passaram.
Command: pnpm --filter @informach/auth --filter @informach/billing --filter @informach/emails test
Executed: 2026-09-11 23:35:44–23:35:56 America/Sao_Paulo
Exit code: 0
Output summary: emails Tests 106 passed (106); auth Tests 216 passed (216); billing Tests 185 passed (185). Total: 507.
Warnings: none
Errors: none
Verdict: PASS
```

## Tipos

[Saída completa](typecheck.log.txt).

```text
VERIFICATION REPORT
-------------------
Claim: TypeScript passou no app e nos quatro pacotes compartilhados verificados.
Command: pnpm --filter @informach/agenda-da-turma --filter @informach/auth --filter @informach/billing --filter @informach/emails --filter @informach/db typecheck
Executed: 2026-09-11 23:36:13–23:36:57 America/Sao_Paulo
Exit code: 0
Output summary: packages/db, packages/emails, packages/auth, packages/billing e apps/agenda-da-turma typecheck: Done.
Warnings: none
Errors: none
Verdict: PASS
```

## Formatação e lint

[Saída completa](biome.log.txt). A seleção inclui código/configurações novos e alterados, inclusive arquivos ainda não versionados. Exclui documentos/evidências e snapshots gerados do Drizzle. A chamada direta ao executável Node do Biome evita o limite de tamanho de comando do wrapper Windows do pnpm.

```powershell
$reviewFiles = @(git -c core.safecrlf=false diff --name-only --diff-filter=ACMR) + @(git ls-files --others --exclude-standard)
$reviewPaths = @($reviewFiles | Where-Object { $_ -match '\.(ts|tsx|js|mjs|json)$' -and $_ -notmatch '^packages/db/src/migrations/meta/|^docs/' } | Sort-Object -Unique)
node node_modules/@biomejs/biome/bin/biome check @reviewPaths
```

```text
VERIFICATION REPORT
-------------------
Claim: Formatação e lint passaram no código/configuração afetados.
Command: node node_modules/@biomejs/biome/bin/biome check @reviewPaths (seleção exata acima)
Executed: 2026-09-11 23:37:58 America/Sao_Paulo
Exit code: 0
Output summary: Checked 185 files in 352ms. No fixes applied.
Warnings: none
Errors: none
Verdict: PASS
```

## Build

[Saída completa](build.log.txt). Comando com o ambiente utilizado:

```powershell
$env:NODE_ENV='production'
$env:NEXT_PUBLIC_APP_URL='https://agenda-da-turma.informach.com.br'
$env:BETTER_AUTH_URL='https://agenda-da-turma.informach.com.br'
pnpm --filter @informach/agenda-da-turma build
```

```text
VERIFICATION REPORT
-------------------
Claim: O build otimizado de produção foi gerado.
Command: pnpm --filter @informach/agenda-da-turma build (ambiente acima)
Executed: 2026-09-11 23:37:08–23:38:27 America/Sao_Paulo
Exit code: 0
Output summary: Compiled successfully in 32.7s; Finished TypeScript in 26.9s; Generating static pages using 11 workers (50/50) in 1698ms; tabela de rotas concluída.
Warnings: Next informa o experimento clientTraceMetadata. Build não comprova runtime de produção; navegador usou desenvolvimento.
Errors: none
Verdict: PASS
```

## Navegador

[Correções](browser.log.txt): quatro edições escolares consecutivas; publicação identificada; confirmação explícita do escopo; reutilização da extração para o segundo filho pela rota real; escolha de retificação e preservação da ação do outro filho. O teste usa extrações sintéticas previamente persistidas para isolar o fluxo da interface; não chama o provedor de IA.

```text
VERIFICATION REPORT
-------------------
Claim: O fluxo de correções passou no navegador móvel.
Command: pnpm --filter @informach/agenda-da-turma exec playwright test --config playwright.routine.config.ts review-fixes.spec.ts
Executed: 2026-09-11 23:32:37–23:33:18 America/Sao_Paulo
Exit code: 0
Output summary: review fixes: consecutive edits, source scope, reuse for another child and deadline correction (33.0s); 1 passed (38.5s).
Warnings: NO_COLOR ignorado porque FORCE_COLOR está definido. Servidor local de desenvolvimento; zero retries configurados.
Errors: none
Verdict: PASS
```

[Rotina familiar](browser-family.log.txt): duas contas com cadastro/OTP em sandbox, escopo privado por criança, conclusão, revogação e exclusão confirmada. O teste também exige ausência de erros de execução/hidratação e de CSP no fluxo observado. Ambiente: `E2E_BASE_URL=http://localhost:3001`, `EMAIL_SANDBOX_DIR=./tmp/implementation-emails`.

```text
VERIFICATION REPORT
-------------------
Claim: O fluxo familiar existente passou após as correções.
Command: pnpm --filter @informach/agenda-da-turma exec playwright test --config playwright.routine.config.ts family-routine.spec.ts
Executed: 2026-09-11 23:33:53–23:34:18 America/Sao_Paulo
Exit code: 0
Output summary: two adults, private child access, completion, revocation and confirmed deletion (19.6s); 1 passed (23.0s).
Warnings: NO_COLOR ignorado porque FORCE_COLOR está definido. E-mails em sandbox, assinatura sintética local e desenvolvimento com CSP ligada; zero retries configurados.
Errors: none
Verdict: PASS
```

## IA com provedor real

[Saída](ai-evaluation.log.txt) e [resultado estruturado](ai-evaluation.json). Modelo `openai/gpt-4o` pela mesma função de geração/validação usada em produção. O caso de publicação no original foi acrescentado aos 15 casos existentes, sem relaxar suas asserções. Só conteúdo fictício foi enviado.

```text
VERIFICATION REPORT
-------------------
Claim: Os 16 casos do corpus sintético passaram nesta execução com o provedor real.
Command: $env:AGENDA_RUN_AI_EVAL='1'; pnpm --filter @informach/agenda-da-turma test:ai-eval
Executed: 2026-09-11 23:33:44–23:34:17 America/Sao_Paulo
Exit code: 0
Output summary: Test Files 1 passed (1); Tests 16 passed (16); Duration 33.18s. JSON: cases=16, completed=16, passed=16.
Warnings: Uma execução de corpus sintético não estima precisão em recados reais. Houve uso do provedor e consumo de tokens; detalhes estão no JSON. Revisão humana permanece necessária.
Errors: none
Verdict: PASS
```

## Banco local e limpeza

[Resultado](database.json) e [script de consulta](verify-local-db.mjs.txt). A verificação só lê o banco: compara hashes dos arquivos 0037/0038 com o journal aplicado, examina a coluna JSONb e as restrições de aplicações, e conta usuários/customers com os identificadores exclusivos das fixtures de revisão e navegador.

Para reproduzir, salvar a cópia do script como `apps/agenda-da-turma/tmp/fix-review/verify-local-db.mjs` e executar da raiz. Ele carrega a URL local em memória, recusa host externo e usa transação somente de leitura; não imprime a URL.

```text
VERIFICATION REPORT
-------------------
Claim: Migrações das correções estão registradas no banco local e as fixtures consultadas foram limpas.
Command: node apps/agenda-da-turma/tmp/fix-review/verify-local-db.mjs
Executed: 2026-09-11 23:39:11 America/Sao_Paulo
Exit code: 0
Output summary: migrations 0037/0038 recorded=true; users_remaining=0; customers_remaining=0; sourceScope.data_type=jsonb; applicationForeignKeys=2; applicationUniqueIndexes=1.
Warnings: Não houve migração nem consulta a banco de produção. Não é ensaio de migração sobre cópia da base de destino.
Errors: none
Verdict: PASS
```

## Limites e rastreabilidade

O [relatório das correções](../../CORRECOES.md) relaciona cada critério de aceitação ao comportamento entregue. As reproduções da revisão anterior permanecem em sua própria pasta e esperam o defeito antigo; não são usadas como aceitação desta entrega.

As execuções finais acima passaram. Antes delas, testes detectaram qualificação SQL ambígua, contrato estruturado incompatível com o provedor e instruções insuficientes para separar materiais sem prazo; os problemas foram corrigidos. Um locator de teste foi ajustado para usar o nome acessível do combobox. Uma tentativa de navegador falhou durante o reinício automático do Next; a final passou. Uma execução de suites em paralelo excedeu o timeout de importação do teste de auditoria; a suite completa passou sem alteração de timeout. Nenhum teste foi ignorado e não foram acrescentadas supressões de tipos/lint.

Runtime de produção, migração no ambiente de destino, entrega real de push/e-mail, scheduler e cobrança real não foram homologados nesta etapa. Os resultados também não demonstram conversão comercial ou retenção.
