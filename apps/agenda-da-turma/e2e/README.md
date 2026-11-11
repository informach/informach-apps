# Navegador da Agenda da Turma

O comando do app usa o runner compartilhado em `scripts/compasso/app-e2e.mjs`. Ele cria PostgreSQL e Redis descartáveis, aplica as migrations, registra os clientes OAuth e compila a central (3011) e a Agenda (3001) em diretórios próprios. O Playwright usa `apps/conta/playwright.apps.config.ts`, em computador e celular, sem reaproveitar serviços dessas portas. As integrações externas recebem apenas configuração sintética.

```powershell
pnpm --filter @informach/agenda-da-turma e2e:install
pnpm --filter @informach/agenda-da-turma e2e
# Uma jornada, mantendo o isolamento completo:
$env:COMPASSO_BROWSER_GREP='offline queue:'
pnpm --filter @informach/agenda-da-turma e2e
Remove-Item Env:COMPASSO_BROWSER_GREP
```

Não precisa aplicar migrations ou configurar `.env.local` para o ensaio. O runner é dono da base e dos artefatos que cria e os remove no fim, inclusive em falha. Nunca limpe usuários de um banco compartilhado para preparar o teste. As fixtures usam identidades sintéticas e os serviços reais de família; o acesso ao app passa pelo login central e pela troca OAuth. Cadastro, códigos de e-mail e proteção da conta pertencem à suite da central e do package auth, enquanto a matriz SSO confere os endpoints locais aposentados.

As jornadas cobrem ativação de crianças existentes, contexto familiar, concessões, recados, filtros, calendário, modo criança, fila offline e navegação comercial. Saídas de IA já persistidas são fixtures; não há chamada real a provedor ou cobrança real. Evidências por rodada e pendências ficam em `docs/propostas/assinatura-web-2026-11-09/implementacao.md`.

Traces e capturas ficam em `apps/conta/test-results/compasso-apps/agenda-da-turma`. Abrir uma falha com `pnpm --filter @informach/conta exec playwright show-trace <caminho-do-trace.zip>`. A fixture de banco se encerra quando a execução termina; o trace não requer reabrir o app.
