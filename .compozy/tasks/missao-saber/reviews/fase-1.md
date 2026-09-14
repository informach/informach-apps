# Review da fase 1 — fundação

Data: 13/09/2026. Revisão independente e somente leitura de código, seguindo `cy-review-round`. Contexto: `_prd.md`, `_techspec.md`, `_tasks.md` e `CLAUDE.md` da raiz. Não havia ADRs nem rodadas anteriores nesta tarefa.

## Escopo e mapa

- `apps/missao-saber`: pacote Next.js/React na porta 3005, configuração TypeScript/Vitest, layout e página iniciais, estilos básicos, proxy de cabeçalhos, health check e rota de autenticação; bibliotecas `auth`, `auth-client`, `env`, `emails`, `errors` e `logger`.
- Rota `/api/auth/[...all]` → `lib/auth` → factory de `@informach/auth` → Better Auth, schema `core` e helper de autenticação no servidor. Configurações OTP de cliente e servidor coincidem; organizações estão desabilitadas.
- `lib/auth` → `lib/emails` → `@informach/emails` e DB preguiçoso compartilhado. Segredos permanecem em módulos de servidor. Exclusão da conta global está explicitamente desabilitada enquanto a limpeza específica do app é implementada em fase posterior.
- `proxy.ts` injeta CSP com nonce por requisição; `next.config.ts` acrescenta cabeçalhos de proteção. O layout é dinâmico para compatibilidade com o nonce. O proxy não autentica: a decisão explícita de exigir sessão nas páginas protegidas e mutações será verificada nas fases seguintes.
- `packages/config/src/apps.ts` registra identidade e domínio. O app é descoberto por `apps/*` no workspace e todos os pacotes Informach consumidos são transpilados pelo Next.
- Schema `missao_saber` → oito tabelas: famílias, perfis, sessões, tentativas, pistas, caderno, releases e relatos. Migração `0040_right_victor_mancha.sql`, snapshot e journal registram a adição; `schema/index.ts` e `drizzle.config.ts` incluem o novo schema.

## Resultado

**Clean — ready to merge (escopo de F1).** A questão média identificada foi corrigida e verificada em 13/09/2026. Nenhuma questão crítica, alta ou baixa; nenhuma pendência remanescente nesta rodada.

Questão registrada e resolvida: [issue_001.md](../reviews-001/issue_001.md), variáveis `MISSAO_*` ausentes do ambiente/cache do Turbo. O dry run com cinco valores sentinela confirmou `PASS: 5 MISSAO variables specified and 5 configured in Turbo build dry run.` (exit 0). A rodada `reviews-001` tem um item resolvido e zero pendências.

Aspectos bem implementados: separação entre os apps sem importar código de outra aplicação; uso das factories existentes de autenticação/e-mail; DB sem conexão antecipada durante importação; cascatas limitadas aos registros pedagógicos e referências editoriais preservadas com `set null`; unicidades no banco para requisição de sessão e tentativa por item; índices nas consultas previsíveis; CSP com nonce e proteção contra framing; configuração explícita de OTP e exclusão global desabilitada com justificativa.

## Cobertura dos requisitos desta fase

| Requisito de F1 | Resultado |
| --- | --- |
| Novo app independente no monorepo | Scaffold, pacote, porta e identidade presentes. |
| Autenticação do responsável | Factory e endpoint presentes; UI e jornada autenticada pertencem às próximas fases. |
| Schema para famílias/perfis e histórico isolados | Relações e índices presentes; autorização por proprietário será testada com o repositório de F2. |
| Migration gerada | SQL, snapshot e journal presentes; `drizzle-kit check` passou. Aplicação em banco descartável ainda será validada na integração. |
| Integração com configuração compartilhada | Registro do app presente; cinco variáveis registradas e confirmadas no dry run do Turbo. |

Foram examinadas segurança, correção, concorrência, desempenho, erros, manutenção, testes, arquitetura e operação conforme o escopo. Não foram tratadas como defeitos as telas, rotinas de cobrança, pipeline editorial, conteúdo e serviços pedagógicos ainda não implementados, que pertencem a F2–F5.

## Evidência

```text
VERIFICATION REPORT
-------------------
Claim: Verificações estáticas da fundação e integridade dos snapshots passaram.
Command: pnpm exec biome lint apps/missao-saber packages/config/src/apps.ts packages/db/src/schema/missao-saber.ts
Executed: 2026-09-13, após leitura do scaffold de F1
Exit code: 0
Output summary: Checked 19 files in 12ms. No fixes applied.
Warnings: none
Errors: none
Verdict: PASS
```

Também executados, cada um com código 0: `pnpm --filter @informach/missao-saber typecheck`, `pnpm --filter @informach/db typecheck`, `pnpm --filter @informach/config typecheck` (`tsc --noEmit` sem diagnósticos); `pnpm --filter @informach/db exec drizzle-kit check` com URL local fictícia (`Everything's fine`), sem migração nem conexão a banco de produção. O dry run do Turbo confirmou a omissão documentada; ele não substitui um build real.

Limites: este review não declara o app completo, as rotas privadas prontas, uma migration aplicada ou o build/E2E integral aprovados. Esses resultados dependem das fases seguintes. Nenhum arquivo de aplicação foi modificado durante a revisão.
