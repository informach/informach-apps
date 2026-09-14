# Review da fase 5 — integração, verificação e operação

Data: 13/09/2026. Revisão independente seguindo `cy-review-round`, sem alterações em código da aplicação. Escopo priorizado: runner de banco descartável, testes de integração/E2E, configuração de build/ambiente, migrations, novos contratos compartilhados de coordenação/cobrança e documentação de operação. Os fluxos funcionais de F1–F4 foram revalidados conforme seus relatórios.

## Resultado

**Clean — nenhum achado remanescente desta fase.** Uma questão nova de alta severidade foi identificada e corrigida: [reviews-005/issue_001.md](../reviews-005/issue_001.md), esgotamento do pool por transações de coordenação que aguardavam consultas no mesmo pool. A rodada contém uma questão resolvida e nenhuma aberta. O full review foi concluído e suas duas correções adicionais também foram verificadas.

O helper compartilhado `withDatabaseLock()` usa até duas conexões próprias e não reserva as dez conexões de consultas usadas pelos callbacks. A aplicação mantém a trava por responsável para checkout, encerramento e webhook. O novo contrato é opt-in; aplicações existentes não passam a reservar conexões de coordenação sem chamar o helper. O documento de produção registra o orçamento de doze conexões por processo.

## Mapa de integração

- `scripts/isolated.mjs` valida host local, gera nome fechado `missao_review_<uuid>`, cria banco próprio, aplica migrations e executa Vitest/Playwright. Remove o banco no `finally`; preview separado preserva banco `missao_preview_<uuid>` e grava `.env.local` sem sobrescrever arquivo existente.
- `vitest.integration.config.ts` e `playwright.config.ts` recusam execução sem destino local descartável e sinalizador do runner. O E2E usa porta 3105 e `.next-e2e`; e-mail vai para sandbox e assinaturas são fixtures de banco, sem pagamento externo.
- Migrations `0040` e `0041` criam o schema pedagógico, experimentos e hash editorial; a aplicação em bancos novos foi executada repetidamente pelo runner. A revisão não aplicou migrations em banco compartilhado ou produção.
- Novos contratos de billing: fechamento remoto paginado, IDs de assinaturas encerradas persistidos, guard de eventos atrasados e retorno explícito de supressão no sweeper. Compatibilidade dos chamadores antigos é preservada por opções e métodos adicionais.
- `README.md`, `PRODUCAO.md`, `railway.toml`, comandos da raiz, `.env.example`, Turbo e exclusões dos artefatos dão um caminho de preview, homologação e lançamento. Segredos reais, preços, remetente, alertas e agendamento permanecem configuração externa, descrita como pendente.

## Evidência

```text
VERIFICATION REPORT
-------------------
Claim: Regressões de domínio, persistência e coordenação passam em PostgreSQL descartável.
Command: pnpm --filter @informach/missao-saber test:integration
Executed independently: 2026-09-13 11:43:15 America/Sao_Paulo
Exit code: 0
Output summary: 2 test files passed; 14 tests passed; banco descartável removido.
Coverage: isolamento e limite de perfis, replay concorrente, pistas, embargo de avaliações,
          entitlement por app, retirada/hash editorial, experimentos, cascata de limpeza,
          fila editorial >100/200, SendGrid assinado, dunning, fechamento/eventos atrasados,
          12 responsáveis com consultas reais dentro de locks em até 5 segundos.
Verdict: PASS
```

Há notices conhecidos de migrations anteriores (`unaccent`/`pg_trgm` já existentes e truncamento de nome de FK legado), sem falha de migração. Um aviso de profile do PowerShell apareceu antes do runner em uma execução; o processo de teste terminou com exit 0 e seu próprio banco foi removido.

O implementador executou E2E em desktop e Pixel 7: seis casos aprovados, incluindo cadastro/OTP, criação de perfis, missão com pista, pausa/retomada, conclusão, diagnóstico com próximo passo, caderno, malha persistida, exportação, bloqueio de venda sem configuração, troca de perfil, barras proporcionais, ausência de overflow e endpoints sem autorização. O revisor releu os testes e o arquivo `.last-run.json` aprovado; essa execução de navegador não é apresentada como uma execução independente do revisor.

O implementador informou as verificações finais após as correções: typecheck do workspace 12/12, testes de sete packages (com três tarefas em cache), 188 testes de billing reexecutados, build de produção e check focado em 109 arquivos aprovados. O full review contém a última integração independente, com 15 testes aprovados às 11:52:34, e o relatório de entrega registra as execuções finais.

**Limitação de verificação:** `pnpm check` global não está limpo. A execução informada retornou 4.209 erros e 1.971 avisos, abrangendo artefatos de pesquisa e formatação legada de outros packages. Esses arquivos não foram reformatados como parte desta tarefa. A aprovação do check focado não deve ser descrita como aprovação do lint integral do repositório.

## Limites de prontidão

Os testes usam fornecedores controlados/sandbox: validam os contratos, não substituem homologação do Checkout/Portal/SendGrid com as contas reais de teste. Não houve deploy, venda, envio real, aprovação pedagógica ou avaliação com alunos. O job tem lotes limitados e precisa de monitoramento de backlog; o healthcheck confirma o processo HTTP, não a saúde integral do banco. Esses limites e a expansão do catálogo estão explicitados no roteiro de operação.
