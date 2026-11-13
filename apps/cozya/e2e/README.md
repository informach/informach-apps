# E2E — Cozya com Compasso

Execute `pnpm --filter @informach/cozya e2e` na raiz. O runner `scripts/compasso/app-e2e.mjs` cria PostgreSQL, Redis e builds standalone descartáveis. Conta usa 3011 e Cozya 3002; as portas devem estar livres. Não reutiliza dados, credenciais ou servidores reais. Instale o navegador com `pnpm --filter @informach/cozya e2e:install`.

A configuração fica em `apps/conta/playwright.apps.config.ts`: desktop e celular, um worker e sem retries. SSO, reautenticação e saída são exercitados pela matriz central. `fixtures/compasso.ts` cria identidades sintéticas e cobertura explícita; a primeira semana não ativa o teste sozinha.

- `kitchen.spec.ts`: receitas, marmitas, compras em duas fases, preparo, feedback e descarte do microfone.
- `marketing.spec.ts`: demonstração, tamanhos de tela, teclado, movimento reduzido e conteúdo sem JavaScript.
- `compasso.spec.ts`: família financiadora, conteúdo individual, contexto gratuito, custo antes da IA, UUID mantido após falha de transporte, recusa de contexto obsoleto e ciclo/família na contratação central.

O teste de transporte intercepta HTTP no navegador; não comprova modelo ou débito. Cobrança, carteira e recibos reais são ensaiados separadamente em `test/ai-shared.integration.ts`, com provedor simulado. O E2E não usa IA, Stripe ou e-mail reais. O ensaio pago opt-in continua separado.

Para focar uma jornada, defina `COMPASSO_BROWSER_GREP` com seu título e execute o mesmo comando. Falhas conservam traces em `apps/conta/test-results/compasso-apps/cozya`. Um teste focado não substitui a matriz completa.
