# Verificação para publicação — 12/09/2026

Escopo: implementação da rotina familiar, correções da revisão e nova página de vendas do Agenda da Turma, incluindo as alterações compartilhadas necessárias em autenticação, banco, cobrança e e-mails.

```text
VERIFICATION REPORT
-------------------
Claim: Formatação, lint, tipos, testes e builds passaram para a publicação.
Command: biome check .
         pnpm typecheck
         pnpm exec turbo test --concurrency=1 --force
         pnpm --filter @informach/agenda-da-turma test:integration
         pnpm --filter @informach/agenda-da-turma exec playwright test --config playwright.routine.config.ts
         pnpm --filter @informach/agenda-da-turma exec playwright test --config playwright.marketing.config.ts
         pnpm exec turbo build --concurrency=1 --force
         git diff --cached --check
         node apps/agenda-da-turma/tmp/release/scan-staged.mjs
Executed: 2026-09-12, nesta sessão de publicação; build e lint finais após as correções.
Exit code: 0 em todos os comandos acima
Output summary: Biome: Checked 911 files. No fixes applied.
                Tipos: Tasks: 11 successful, 11 total.
                Testes: Tasks: 6 successful, 6 total; 1.161 testes aprovados.
                Integração: Test Files 4 passed (4); Tests 35 passed (35).
                Navegador, rotina: 2 passed (2.3m).
                Navegador, vendas: 5 passed (19.0s).
                Build: Tasks: 4 successful, 4 total; 0 cached.
                Diff: nenhuma ocorrência de erro de whitespace.
                Segredos: {"files":269,"findings":[]}.
Warnings: none nas execuções finais
Errors: none nas execuções finais
Verdict: PASS
```

O Biome foi executado com a versão instalada no projeto, sobre uma exportação exata do índice Git com finais de linha LF, em diretório separado do workspace. Isso verifica os arquivos que serão publicados sem incluir ferramentas temporárias locais. A exportação precisa ficar fora de diretórios ignorados: sob `.cache`, a descoberta automática dos projetos React/Next produzia avisos de supressões não utilizadas; a mesma exportação em diretório normal passou sem alteração das regras ou do código.

Os testes de navegador usaram o servidor local e e-mails em sandbox. Os quatro builds usaram credenciais fictícias de build. A execução final dos testes unitários e dos builds processou um pacote por vez e não reutilizou cache. O cache de produção do Turbo agora exclui `.next/dev`, pois o servidor de desenvolvimento pode remover arquivos desse diretório durante a captura do cache.

Os logs completos desta sessão ficam em `apps/agenda-da-turma/tmp/release/` (diretório local ignorado pelo Git). Este relatório preserva os resultados relevantes no repositório.

## Preparação do banco de produção

- Backup PostgreSQL em formato custom concluído antes das migrações, no volume persistente do serviço Postgres: `agenda-before-release-20260912.dump`, 14.348.249 bytes, permissões restritas.
- Migrações `0035` a `0039` aplicadas pelo comando padrão `pnpm --filter @informach/db db:migrate`, com saída `[db:migrate] done.` e código 0.
- Conferência posterior: 40 migrações existentes verificadas e nenhuma pendente. A diferença histórica no checksum da migração `0010` corresponde à versão anterior presente no histórico Git; nenhuma migração existente foi reescrita nesta preparação.
- Seed específico dos preços de crédito do Agenda: 1 registro inserido e 7 já existentes preservados. A extração de recados está registrada por 1 crédito.

A publicação do código depende do push para `main`. Este relatório registra a verificação anterior ao commit e não afirma que a nova versão já está atendendo tráfego em produção.
