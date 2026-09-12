# Evidências da revisão da implementação

Execuções realizadas em 11/09/2026, horário de São Paulo, durante a revisão posterior à implementação. Raiz do workspace: `C:\Users\tocha\projects\informach-apps`. Shell: PowerShell. Nenhum código funcional foi alterado nesta revisão.

O [relatório](../../REVISAO-IMPLEMENTACAO.md) explica os achados e as condições de reprodução. Os blocos abaixo registram os comandos executados e os trechos relevantes dos resultados observados; não são transcrições completas dos logs. As evidências da etapa anterior continuam em [IMPLEMENTACAO.md](../IMPLEMENTACAO.md).

## Verificações existentes

```text
VERIFICATION REPORT
-------------------
Claim: A suite unitária existente do app passa no estado revisado.
Command: pnpm --filter @informach/agenda-da-turma test
Executed: 11/09/2026, início 22:12:46, nesta revisão
Exit code: 0
Output summary: Test Files 36 passed (36); Tests 478 passed (478); Duration 5.44s.
Warnings: Este resultado cobre a suite existente, não a ausência dos achados desta revisão.
Errors: Nenhum teste falhou.
Verdict: PASS
```

```text
VERIFICATION REPORT
-------------------
Claim: A suite de integração existente passa em PostgreSQL local.
Command: pnpm --filter @informach/agenda-da-turma test:integration
Executed: 11/09/2026, início 22:12:46, nesta revisão
Exit code: 0
Output summary: Test Files 2 passed (2); Tests 16 passed (16); Duration 14.09s.
Warnings: Dados fictícios e e-mail em memória; sem homologação de provedores externos.
Errors: Nenhum teste falhou.
Verdict: PASS
```

```text
VERIFICATION REPORT
-------------------
Claim: As suites dos pacotes compartilhados de autenticação, billing e e-mail passam.
Command: pnpm --filter @informach/auth --filter @informach/billing --filter @informach/emails test
Executed: 11/09/2026, nesta revisão, aproximadamente 22:15
Exit code: 0
Output summary: Auth: 216 passed, 8 files. Billing: 185 passed, 23 files. Emails: 106 passed, 8 files. Total: 507 testes.
Warnings: Não houve transação financeira nem entrega a destinatário real.
Errors: Nenhum teste falhou.
Verdict: PASS
```

```text
VERIFICATION REPORT
-------------------
Claim: A checagem de tipos do app passa.
Command: pnpm --filter @informach/agenda-da-turma typecheck
Executed: 11/09/2026, nesta revisão
Exit code: 0
Output summary: tsc --noEmit concluído sem diagnóstico de erro.
Warnings: Tipos opcionais não detectam a omissão de versão descrita em F01.
Errors: Nenhum erro de tipos reportado.
Verdict: PASS
```

```text
VERIFICATION REPORT
-------------------
Claim: O build de produção compila e gera as rotas do app.
Command:
$env:NODE_ENV = 'production'
$env:NEXT_PUBLIC_APP_URL = 'https://agenda-da-turma.informach.com.br'
$env:BETTER_AUTH_URL = 'https://agenda-da-turma.informach.com.br'
pnpm --filter @informach/agenda-da-turma build
Executed: 11/09/2026, nesta revisão
Exit code: 0
Output summary: Compiled successfully in 34.6s; TypeScript 27.4s; geração de páginas 50/50 concluída.
Warnings: Build aprovado não comprova runtime de produção; o teste de navegador utilizou desenvolvimento.
Errors: Nenhum erro de build reportado.
Verdict: PASS
```

```text
VERIFICATION REPORT
-------------------
Claim: Biome passa no código do app e nos arquivos compartilhados afetados incluídos no comando.
Command: pnpm exec biome check apps/agenda-da-turma/src packages/auth/src/index.ts packages/db/src/schema/agenda.ts packages/db/src/schema/agenda-family.ts packages/db/src/schema/index.ts packages/billing/src/seeds/credit-pricing.ts packages/emails/src/dispatch.ts packages/emails/src/schemas.ts packages/emails/src/sweepers.ts apps/agenda-da-turma/package.json turbo.json
Executed: 11/09/2026, nesta revisão
Exit code: 0
Output summary: Checked 384 files in 538ms. No fixes applied.
Warnings: Uma seleção inicial mais ampla incluiu schema inalterado do Cozya com diferença de formatação; não foi modificado nem classificado como achado do Agenda.
Errors: Nenhum no escopo do comando acima.
Verdict: PASS
```

## Reproduções dos achados

```text
VERIFICATION REPORT
-------------------
Claim: Dez cenários adicionais reproduzem o comportamento defeituoso descrito em F01–F10.
Command: pnpm --filter @informach/agenda-da-turma exec vitest run --config tmp/full-review/review.config.ts --reporter=json --outputFile=tmp/full-review/reproductions-result.json
Executed: 11/09/2026, nesta revisão, aproximadamente 22:25
Exit code: 0
Output summary: numTotalTests=10; numPassedTests=10; numFailedTests=0; success=true.
Warnings: Os asserts esperam o defeito. PASS confirma a reprodução e NÃO significa correção ou aceitação do produto.
Errors: Nenhum cenário de reprodução falhou na execução final.
Verdict: PASS
```

O [resultado JSON](reproductions-result.json) contém nomes, tempos e resultados dos dez cenários. O [código executado](reproductions.test.ts.txt) usa serviços/repositórios reais e PostgreSQL local, além de e-mail em memória. O modelo de IA, o Stripe e o provedor de e-mail não foram chamados. Em F06, as extrações foram preparadas para isolar a confirmação; em F09, uma transação controlada representa a seção de revogação; em F10, o validador é exercitado diretamente. Esses limites também estão descritos no relatório.

```text
VERIFICATION REPORT
-------------------
Claim: A interface real recusa a segunda edição da atividade, reproduzindo F01.
Command: pnpm --filter @informach/agenda-da-turma exec playwright test --config tmp/full-review/browser.config.ts
Executed: 11/09/2026, nesta revisão, concluído aproximadamente 22:25
Exit code: 0
Output summary: 1 passed (1.6m). Toast VERSION_CONFLICT visível; banco permaneceu na versão 2 com o título da primeira edição.
Warnings: Cenário afirma a presença do defeito. Servidor local de desenvolvimento com CSP ligada, Edge/Chromium, viewport 390 × 844.
Errors: Nenhum erro do cenário final; o erro funcional esperado apareceu na interface.
Verdict: PASS
```

O [teste de navegador](browser.spec.ts.txt) prepara uma conta fictícia verificada no banco, com hash de senha pelo Better Auth instalado, e entra pela API normal de login. A preparação evita consumir novamente a quota local de cadastros, já atingida na primeira tentativa. Não desabilita o limite nem modifica autenticação. Esse cenário não revalida o cadastro/OTP, que tinha evidência na implementação anterior.

A [captura](second-edit-rejected.png) foi obtida durante a transição de fechamento do diálogo; o aviso aparece parcialmente sobreposto à navegação inferior. A confirmação do achado depende também da asserção de visibilidade e da consulta ao registro no banco, não apenas da imagem.

Os dados fictícios de cada cenário são removidos em `afterEach`/`finally`. Nenhuma família real recebeu comunicação ou teve dados usados como fixture.

## Como repetir os cenários

Os arquivos `.ts.txt` preservam exatamente os scripts usados sem incluí-los como testes de aceitação ou código compilável na documentação. Para repetir, é necessário o banco PostgreSQL local com as migrações e referências de cidade, dependências instaladas e configuração local do app já utilizada na implementação.

Execute na raiz do repositório:

```powershell
$reviewSource = 'docs/reviews/agenda-da-turma-2026-09-11/evidence/revisao-implementacao'
$reviewTarget = 'apps/agenda-da-turma/tmp/full-review'
New-Item -ItemType Directory -Path $reviewTarget -Force | Out-Null
Copy-Item -LiteralPath "$reviewSource/reproductions.test.ts.txt" -Destination "$reviewTarget/reproductions.test.ts"
Copy-Item -LiteralPath "$reviewSource/review.config.ts.txt" -Destination "$reviewTarget/review.config.ts"
Copy-Item -LiteralPath "$reviewSource/browser.spec.ts.txt" -Destination "$reviewTarget/browser.spec.ts"
Copy-Item -LiteralPath "$reviewSource/browser.config.ts.txt" -Destination "$reviewTarget/browser.config.ts"
pnpm --filter @informach/agenda-da-turma exec vitest run --config tmp/full-review/review.config.ts --reporter=json --outputFile=tmp/full-review/reproductions-result.json
```

Para o navegador, o app deve estar disponível em `http://localhost:3001` com envio em sandbox. A configuração herdada recusa banco e URL externos. Com esse servidor disponível:

```powershell
pnpm --filter @informach/agenda-da-turma exec playwright test --config tmp/full-review/browser.config.ts
```

Depois das correções, espera-se que os asserts que demonstram os defeitos deixem de passar. Transformar os cenários relevantes em regressões afirmando o comportamento correto, inclusive privacidade, recuperação, concorrência e ausência de duplicação.

## Conferência dos artefatos e limpeza

O [script de conferência](verify-artifacts.mjs.txt) valida a correspondência entre achados e resultados, a integridade das seis cópias das evidências originais e os links locais. Consulta somente a contagem de usuários fictícios desta revisão, em transação de leitura no banco local. Para repetir, copiar o script para `apps/agenda-da-turma/tmp/full-review/verify-artifacts.mjs` e executar na raiz do repositório.

```text
VERIFICATION REPORT
-------------------
Claim: O relatório corresponde às reproduções, as cópias e links existem e não restaram usuários fictícios desta revisão.
Command: node apps/agenda-da-turma/tmp/full-review/verify-artifacts.mjs
Executed: 11/09/2026, ao finalizar os artefatos desta revisão
Exit code: 0
Output summary: 10 findings mapped to 10 confirmed reproductions; 6 P1 and 4 P2; local links exist; 6 evidence copies match; remaining review users: 0.
Warnings: Confere os artefatos e a limpeza das fixtures; não atesta correção do aplicativo.
Errors: Nenhum na execução final.
Verdict: PASS
```

```text
VERIFICATION REPORT
-------------------
Claim: O diff rastreado não apresenta erros de whitespace detectados pelo Git.
Command: git diff --check
Executed: 11/09/2026, ao finalizar esta revisão
Exit code: 0
Output summary: Nenhum diagnóstico de whitespace.
Warnings: Git emitiu avisos de conversão futura LF para CRLF em arquivos já alterados no workspace.
Errors: Nenhum erro detectado pelo comando.
Verdict: PASS
```
