# Revisão completa da implementação da experiência da família

**Data:** 3 de outubro de 2026. **Escopo:** alterações da proposta no Missão Saber e suas dependências de autenticação e banco, incluindo arquivos novos ainda não commitados. A revisão considera a [proposta](proposta.md) e o [registro de implementação](implementacao-e-verificacao.md).

**Resultado:** quatro achados P2 corrigidos. Verificação final: 1.857 testes aprovados, lint de 84 arquivos, tipos dos três projetos e build de produção aprovados. Os resultados abaixo correspondem ao código após a última correção.

## Achados e correções

### R1 · P2 · Rascunho de edição era sobrescrito ao reabrir uma anotação

O hook recuperava o texto do `sessionStorage`, mas o botão Editar o substituía imediatamente pela versão salva no servidor. Depois de escrever, recarregar a página e reabrir a edição, a escrita pendente desaparecia. Cancelar também não removia explicitamente o rascunho armazenado.

Correção em `use-note-draft.ts` e `notebook.tsx`: reabrir usa o texto recuperado; cancelar restaura a versão confirmada e remove o rascunho; mudanças confirmadas no servidor atualizam a referência inicial sem sobrepor escrita pendente. A edição também informa quando o navegador não permite guardar o rascunho.

Evidência: o novo teste de navegador falhou antes da correção ao esperar o texto recuperado. Ele cobre recarregamento, cancelamento explícito e confirmação de uma edição.

### R2 · P2 · Aparelho lembrado perdia o estudante selecionado

O cookie de acesso tinha validade persistente, mas `ms-profile` durava apenas a sessão do navegador, tanto na passagem inicial quanto na troca de estudante. Ao reiniciar o navegador, um aparelho autorizado para irmãos abria o primeiro perfil permitido, em vez daquele que havia sido selecionado.

Correção em `study-access/cookies.ts`, `http.ts`, `server.ts`, `policy.ts` e `learning/actions.ts`: acesso e seleção recebem o mesmo vencimento original do aparelho. Trocar de estudante não renova a autorização. Conexões temporárias continuam usando cookies de sessão.

Evidência: dois testes de navegador falharam antes da correção, reproduzindo passagem direta para o segundo estudante e troca posterior. Os testes restauram somente cookies persistentes em um novo contexto e verificam identidade e vencimento. O fluxo temporário também verifica que ambos os cookies expiram com a sessão.

### R3 · P2 · Mensagens de recuperação usavam texto com contraste insuficiente

A troca de estudante, a saída, o retorno de erro da assinatura e os controles de missão e trilha ainda usavam `text-coral-fundo` para texto pequeno. Medição com os tokens reais e a função de contraste da suíte existente encontrou 3,50:1 sobre papel claro, 3,90:1 sobre creme claro e 3,94:1 sobre creme escuro, abaixo do mínimo de 4,5:1 usado pelo projeto.

Correção em `profile-switcher.tsx`, `sign-out.tsx`, `family-controls.tsx`, `controls.tsx` e `player.tsx`: uso de `text-coral-solido`, preservando os anúncios de erro. Os mesmos pares passam a 5,19:1, 5,79:1 e 6,71:1; sobre papel escuro, 7,69:1. A suíte `tema.test.ts` verifica os dois temas diretamente a partir do CSS. Isso não equivale a certificar acessibilidade integral.

### R4 · P2 · Visão geral ignorava laboratório e reflexões como atividade

A condição de primeiro uso e a data de última atividade dependiam somente de tentativas pontuadas. Um estudante que já tivesse iniciado uma investigação recebia “Tudo pronto para começar”, e uma investigação mais recente que uma tentativa anterior não aparecia como última atividade. Reflexões sem pontuação tinham o mesmo problema.

Correção em `family/activity.ts`, `reports.ts` e na visão geral da família: a última atividade é escolhida pela data entre tentativas válidas, reflexões e eventos registrados do laboratório. A descrição conserva a natureza do registro, e o acesso principal passa a ser o acompanhamento. A sugestão inicial e o cálculo de autonomia continuam dependentes das evidências pedagógicas existentes.

Evidência: quatro testes unitários cobrem ausência de registros, laboratório isolado, reflexão isolada e ordenação entre fontes; um percurso real abre uma investigação, retorna à família e verifica o resumo e a indicação de sugestão inicial.

## Cobertura da revisão

| Área / critério da proposta | Verificação |
| --- | --- |
| Separação entre adulto e estudante | Guardas de páginas, rotas e ações; invalidação do acesso adulto na passagem; desbloqueio recente; tentativas com URL, cookie e requisição alterados. |
| Autorização de aparelhos | Hashes, perfis permitidos, uso único de código, expiração, limites, revogação, conta bloqueada e exclusão em cascata; integração com PostgreSQL real. |
| Primeiro uso e ações principais | Cadastro em etapas, ausência de perfil, ausência de tentativas, atividade exclusivamente de laboratório, retorno após confirmação adulta. |
| Continuidade e isolamento | Seleção explícita entre irmãos, credenciais temporárias e lembradas, rascunhos por perfil, reabertura e cancelamento, saída e limpeza local. |
| Missão, laboratório, caderno, revisão e simulados | Guardas de perfil e sessão, retomada e links de contexto, persistência e navegação nas suítes existentes. |
| Acompanhamento e aprendizagem | Sugestão inicial separada de observação, última atividade real, métodos de evidência preservados; sem novos critérios de domínio ou comparação entre irmãos. |
| Elegibilidade e disponibilidade | Perfis por ano, trilhas permitidas, capacidade familiar, conteúdo gratuito e plano; contratação no espaço adulto. |
| Administração e integrações | Conta, exportação, exclusão, manutenção, pagamento e e-mail contextualizados; tipos e testes do pacote compartilhado de autenticação. |
| Interface e acessibilidade | Três faixas escolares, celular, teclado, alertas, estados de salvamento, redução de movimento e contraste de tokens; limites externos abaixo. |
| Banco e manutenção | Migração aditiva, índices e cascatas; integração em banco descartável; nenhum banco de produção alterado. |

## Verificação após as correções

Logs locais finais: `.cache/family-review-lint.log`, `.cache/family-review-final-checks.log`, `.cache/family-review-contrast.log` e `.cache/family-review-complete-e2e.log`. As rodadas anteriores foram preservadas em `.cache/family-review-before.log` (reprodução), `.cache/family-review-checks.log`, `.cache/family-review-types-final.log`, `.cache/family-review-e2e.log` e `.cache/family-review-e2e-final.log`. Os bancos de verificação são descartáveis; os testes não utilizam produção.

```text
VERIFICATION REPORT
-------------------
Claim: reprodução dos problemas de edição e de perfil lembrado antes da correção
Command: pnpm --filter @informach/missao-saber e2e family-access.spec.ts --project=desktop --grep 'editing restores|remembered study'
Executed: 2026-10-03, antes das alterações de produção desta revisão
Exit code: 1
Output summary: 3 failed; esperado o texto recuperado, recebido o original;
                esperado "Olá, Sol.", mas o navegador restaurou o perfil anterior
Warnings: NO_COLOR/FORCE_COLOR e avisos de migração existentes
Errors: as três asserções de regressão falharam conforme a reprodução
Verdict: FAIL (linha de base intencional, preservada para comparação)
```

```text
VERIFICATION REPORT
-------------------
Claim: formatação e lint de todos os arquivos TypeScript da implementação
Command: pnpm exec biome check @files
Executed: 2026-10-03, depois das correções de código
Exit code: 0
Output summary: Checked 84 files in 386ms. No fixes applied.
Warnings: none
Errors: none
Verdict: PASS
```

`@files` foi obtido por `git diff --name-only --diff-filter=ACM` e `git ls-files --others --exclude-standard`, limitado a `apps/missao-saber`, `packages/auth` e `packages/db`, filtrado por `.ts`/`.tsx` e sem duplicatas. `git diff --check` também terminou com código 0.

```text
VERIFICATION REPORT
-------------------
Claim: tipos do aplicativo e dos pacotes compartilhados afetados
Command: pnpm --filter @informach/missao-saber typecheck
         pnpm --filter @informach/auth typecheck
         pnpm --filter @informach/db typecheck
Executed: 2026-10-03, depois das correções de código
Exit code: 0 em cada comando
Output summary: tsc --noEmit, sem diagnósticos nos três projetos
Warnings: none
Errors: none
Verdict: PASS
```

```text
VERIFICATION REPORT
-------------------
Claim: suíte completa do aplicativo, incluindo atividade familiar e contraste
Command: pnpm --filter @informach/missao-saber run test --maxWorkers=2 --minWorkers=1
Executed: 2026-10-03, depois das correções de código
Exit code: 0
Output summary: Test Files 38 passed (38); Tests 1458 passed (1458)
                Duration 12.19s
Warnings: none
Errors: none
Verdict: PASS
```

```text
VERIFICATION REPORT
-------------------
Claim: suíte completa do pacote compartilhado de autenticação
Command: pnpm --filter @informach/auth run test --maxWorkers=2 --minWorkers=1
Executed: 2026-10-03, depois das correções de código
Exit code: 0
Output summary: Test Files 9 passed (9); Tests 219 passed (219)
                Duration 2.38s
Warnings: none
Errors: none
Verdict: PASS
```

```text
VERIFICATION REPORT
-------------------
Claim: suíte completa de integração em PostgreSQL local
Command: pnpm --filter @informach/missao-saber test:integration
Executed: 2026-10-03, depois das correções de código
Exit code: 0
Output summary: Test Files 25 passed (25); Tests 104 passed (104)
                Duration 101.16s; banco isolado removido ao terminar
Warnings: avisos existentes sobre extensões instaladas e truncamento de constraint
Errors: nenhum teste falhou; cenários de falha de transporte emitiram logs esperados
Verdict: PASS
```

```text
VERIFICATION REPORT
-------------------
Claim: build de produção e suíte completa de navegador em computador e celular
Command: pnpm --filter @informach/missao-saber e2e
Executed: 2026-10-03, depois da última correção de código
Exit code: 0
Output summary: Compiled successfully in 14.1s
                Finished TypeScript in 18.7s
                Generating static pages (13/13)
                76 passed (6.8m); banco isolado removido ao terminar
Warnings: avisos de migração existentes e NO_COLOR/FORCE_COLOR;
          encerramento do servidor local concluído explicitamente no Windows
Errors: nenhum erro de build ou teste
Verdict: PASS
```

Total final: 1.458 testes do aplicativo + 219 de autenticação + 104 de integração + 76 de navegador = **1.857 testes aprovados**. As oito execuções dos novos casos de navegador (quatro cenários em duas configurações) e os quatro novos testes de atividade familiar estão incluídos nesse total.

As verificações usaram `NODE_OPTIONS=--max-old-space-size=4096`; o E2E também usou `RAYON_NUM_THREADS=2`. Depois de concluir os testes, o Playwright aguardava a limpeza de seu servidor no Windows gerenciado. Foi encerrado somente o Node do servidor isolado da rodada, após conferir PID e instante de criação. O runner então terminou com código 0 e removeu o banco temporário. Esse procedimento não alterou testes, asserções ou timeouts.

A primeira rodada completa terminou com `72 passed; 4 failed` e código 1. As quatro falhas estavam na comparação exata dos timestamps de cookies expostos pelo Chromium, que diferiam por frações de segundo; a restauração do estudante já passava. Os traces mostraram o mesmo `Expires` HTTP nos dois cookies e após a troca. O teste passou a comparar esse vencimento original nos cabeçalhos, mantendo a exigência de restaurar o estudante correto em um novo navegador. Nenhum cenário, timeout ou requisito foi removido. A rodada completa foi repetida após essa correção do teste.

Essa repetição terminou com `76 passed (8.2m)` e código 0. Uma última conferência identificou o mesmo token de baixo contraste em três mensagens de missão e trilha; depois de aplicar a correção também nesses pontos, o pipeline completo foi executado novamente para registrar o estado final.

## Limites

Avaliação com famílias, leitor de tela, ampliação e aparelhos físicos continua pendente conforme a proposta. A revisão automatizada não mede compreensão da interface nem efeito sobre aprendizagem. Publicação e verificação em produção não fazem parte desta rodada.

As alterações preexistentes em `.claude/settings.local.json` foram preservadas. Não foi feito commit, push ou deploy.
