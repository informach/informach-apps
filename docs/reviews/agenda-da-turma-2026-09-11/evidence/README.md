# Evidências e limites da revisão

Data: 11/09/2026, America/Sao_Paulo. Os resultados abaixo pertencem à sessão desta revisão; não houve alteração no código do aplicativo. Arquivos de pesquisa e logs completos de execução foram mantidos no diretório temporário ignorado `apps/agenda-da-turma/tmp/market-review/`. Aqui ficam os resultados relevantes e as capturas, sem credenciais ou recados reais.

## Navegação

| Evidência | Ambiente e conteúdo | Limitação |
| --- | --- | --- |
| [landing-mobile.png](landing-mobile.png) | Landing publicada em `https://agenda-da-turma.informach.com.br/`, visualização móvel. | Sem autenticação nem compra em produção. |
| [dashboard-mobile.png](dashboard-mobile.png) | App local, viewport 390 × 844, dados inteiramente fictícios. | Execução de desenvolvimento; badge do Next não é problema de produção. |
| [calendario-mobile.png](calendario-mobile.png) | Calendário local na mesma viewport. | Não é medição de performance ou teste de dispositivo físico. |
| [calendario-enter-incorreto.png](calendario-enter-incorreto.png) | Enter sobre atividade existente abre diálogo “Nova atividade”. | Reprodução local do conflito de teclado; nenhuma correção aplicada. |

Passos exercitados: criar conta sintética → verificar OTP por e-mail em sandbox → escolher Free → criar criança fictícia → usar turma/matéria/atividade de fixture isolada → abrir calendário → abrir detalhe por clique → editar título → concluir e retornar a pendente. A turma e a atividade foram preparadas diretamente no banco local para inspecionar as telas; isso não deve ser descrito como teste completo de criação de atividade pela interface.

No problema de teclado, o foco estava no botão da prova já existente. O clique abria seu detalhe, enquanto Enter abria criação. A combinação de `day-cell.tsx` e `activity-blip.tsx` explica a propagação observada.

Durante a navegação da landing, o console registrou avisos de CSP **report-only** sobre scripts. Isso sinaliza divergência da política reportada; não demonstra bloqueio efetivo dos scripts. Core Web Vitals e comportamento com enforcement não foram medidos.

## VERIFICATION REPORT

```text
VERIFICATION REPORT
-------------------
Claim: A suíte unitária existente do Agenda passou nesta revisão.
Command: pnpm --filter @informach/agenda-da-turma test
Executed: 2026-09-11 18:47:02 America/Sao_Paulo
Exit code: 0
Output summary: Test Files 31 passed (31); Tests 461 passed (461); Duration 8.03s
Warnings: Nenhum aviso identificado no log capturado.
Errors: Nenhum teste falhou.
Verdict: PASS
```

```text
VERIFICATION REPORT
-------------------
Claim: O typecheck do Agenda passou nesta revisão.
Command: pnpm --filter @informach/agenda-da-turma typecheck
Executed: 2026-09-11, na sessão de revisão
Exit code: 0
Output summary: @informach/agenda-da-turma@0.0.0 typecheck; tsc --noEmit
Warnings: Nenhum aviso identificado no log capturado.
Errors: Nenhum diagnóstico de TypeScript emitido.
Verdict: PASS
```

```text
VERIFICATION REPORT
-------------------
Claim: O código-fonte do Agenda atende ao Biome executado nesta revisão.
Command: pnpm exec biome check apps/agenda-da-turma/src
Executed: 2026-09-11, na sessão de revisão
Exit code: 1
Output summary: Checked 301 files in 852ms. No fixes applied. Found 1 error.
Warnings: A saída de diferenças de formatação foi truncada pelo próprio Biome.
Errors: apps/agenda-da-turma/src/features/activities/service.test.ts format;
        Formatter would have printed the following content.
Verdict: FAIL
```

```text
VERIFICATION REPORT
-------------------
Claim: A suíte unitária existente do pacote billing passou nesta revisão.
Command: pnpm --filter @informach/billing test
Executed: 2026-09-11 18:50:47 America/Sao_Paulo
Exit code: 0
Output summary: Test Files 23 passed (23); Tests 185 passed (185); Duration 7.59s
Warnings: Nenhum aviso identificado no log capturado.
Errors: Nenhum teste falhou.
Verdict: PASS
```

```text
VERIFICATION REPORT
-------------------
Claim: Exclusão direta de usuário criador de turma encontra uma FK impeditiva.
Command: node apps/agenda-da-turma/tmp/market-review/db-probe.mjs
Executed: 2026-09-11, na sessão de revisão; banco local e transação revertida
Exit code: 0
Output summary: probe=delete-user-who-created-turma; code=23503;
                constraint=turmas_created_by_user_id_users_id_fk; rolledBack=true
Warnings: A sonda verifica a restrição do banco, não o fluxo completo HTTP de exclusão.
Errors: A exclusão produziu o erro esperado de chave estrangeira.
Verdict: PASS
```

O PASS da sonda significa que o problema foi reproduzido. Não significa que exclusão de conta funciona. Da mesma forma, aprovação de testes unitários não prova qualidade da extração de IA, confiabilidade de notificações, conformidade legal ou prontidão de lançamento.

## Trabalho que permanece proposto

Não houve implementação dos achados, mudança de plano, compra, envio externo de mensagens, migração ou implantação. Não foram executados build completo, suíte E2E completa, avaliação de IA com documentos reais, teste de carga, teste Stripe em produção ou integração autenticada com Teams/Batista.

A revisão entrega diagnóstico e proposta. Os critérios de aceite da [revisão](../REVISAO.md) e as metas da [proposta](../PROPOSTA.md) precisam ser usados em uma implementação e em um piloto posteriores.

## Encerramento do ambiente de revisão

A limpeza da fixture local retornou `{"localOnly":true,"removed":{"classes":1,"profiles":1,"users":1,"schools":1}}`. Ela exigiu IDs, nome/e-mail sintéticos e banco em localhost, removendo somente as entidades preparadas para esta inspeção e seus dependentes. A sonda de exclusão já havia sido revertida em sua própria transação. O servidor de desenvolvimento iniciado para a revisão foi interrompido ao final; logs temporários de teste permanecem no diretório ignorado.

```text
VERIFICATION REPORT
-------------------
Claim: Os documentos e seus links locais/evidências existem e estão consistentes.
Command: node apps/agenda-da-turma/tmp/market-review/verify-docs.mjs
Executed: 2026-09-11, após redação dos documentos
Exit code: 0
Output summary: documents=4; localLinksChecked=48; distinctExternalSources=29;
                screenshots=4 (390x844 cada); failures=[]
Warnings: A checagem valida arquivos/links locais, não revalida o conteúdo de sites externos.
Errors: Nenhuma falha encontrada.
Verdict: PASS
```
