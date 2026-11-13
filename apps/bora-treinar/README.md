# Bora Treinar

Treino guiado com o peso do corpo para a família, em `bora-treinar.informach.com.br`. O serviço foi provisionado em 31/10/2026; a migração Compasso desta branch **ainda não foi publicada**. Estado operacional em [PRODUCAO.md](PRODUCAO.md), contratos em [CLAUDE.md](CLAUDE.md).

O instrutor 3D, a câmera e a contagem rodam no aparelho. O servidor guarda sessões, progresso, conquistas e desafios das pessoas ativadas no app. Nome/cor e permissões vêm da central; histórico de treino permanece no Bora. O app não usa IA nem consome créditos.

O Compasso custa R$ 49,90/mês ou R$ 499/ano, para até dois adultos e quatro dependentes, com teste central de 14 dias sem cartão. O gratuito permite um perfil com os treinos iniciais e prática manual. Contratos antigos ainda têm uma ponte de leitura durante a migração, limitada à família de origem; não criam novo checkout ou teste local. O fechamento financeiro e operacional continua obrigatório.

## Abrir localmente

Use as versões do manifest/CI e `pnpm install --frozen-lockfile`. Login exige central na porta 3011, Bora na 3007 e clientes OIDC locais registrados; não há mais cadastro isolado do Bora. Consulte o [runbook da central](../conta/PRODUCAO.md) para a composição local. Testes abaixo criam seu próprio ambiente descartável, sem ler credenciais reais.

O `dev` e o `build` executam `scripts/fetch-assets.mjs` para preparar WASM e modelo MediaPipe conferidos por SHA-256, servidos pela própria origem. `pnpm --filter @informach/bora-treinar assets` executa somente essa preparação; o primeiro download exige rede. O playground a seguir continua disponível sem conta/banco.

## Playground (sem conta e sem banco)

```powershell
pnpm playground:bora-treinar
```

Abre em `http://localhost:3007/dev/playground`. Não precisa de PostgreSQL, login nem assinatura, e nada é salvo. Sem `.env.local`, o script (`scripts/playground.mjs`) preenche as variáveis obrigatórias com valores de mentira só para o app subir. Nesse modo o resto do app (login, conta, treinos salvos) não funciona. Com `.env.local`, ele vale. Em produção, as rotas `/dev/*` respondem 404.

Para abrir no celular na mesma rede Wi-Fi, use o endereço "No celular" que o script imprime (`http://<ip-do-computador>:3007/dev/playground`). O script libera esses IPs no Next (`allowedDevOrigins`, via `BORA_DEV_ORIGINS`), que de outro modo bloqueia o modo de desenvolvimento para quem não é `localhost`. Sem HTTPS o navegador do celular não liga a câmera: o modo manual, a voz e a música funcionam. Para a câmera, rode `pnpm playground:bora-treinar --https`: o script gera com o OpenSSL do Git um certificado autoassinado para `localhost` e os IPs da rede (em `.cache/bora-playground-https`, refeito quando o IP muda, sem instalar nada no sistema) e serve em `https://<ip>:3007`. Nessa porta, quem chega por `http://` (o histórico do celular costuma completar assim) é redirecionado para `https://`; o Next fica atrás, na porta interna 3017. O celular avisa uma vez que a conexão não é particular; toque em Avançado e prossiga.

- **Laboratório da câmera** (`/dev/playground/camera?ex=<id>`): mostra o ângulo medido (bruto e filtrado), a confiança, o fps e o estado do contador. Uma régua marca onde começa a parcial, onde a repetição passa a contar e o limiar. Cada repetição entra numa tabela com a profundidade alcançada. Os limiares mudam ao vivo, e "Copiar regra" leva os números para `catalog/catalog.ts`. No esqueleto desenhado, linha verde é ponto bem visto, laranja só vale durante o movimento e vermelha é descartada.
- **Praticar e treinos prontos**: abrem o player de verdade, com câmera ou manual. No fim, em vez de salvar, mostram o que seria gravado.

## Verificar

```powershell
pnpm --filter @informach/bora-treinar test
pnpm --filter @informach/bora-treinar test:integration
pnpm --filter @informach/bora-treinar e2e
pnpm --filter @informach/bora-treinar typecheck
pnpm build:bora-treinar
```

Integração e navegador usam `scripts/compasso`: PostgreSQL descartável e Redis autenticado em loopback, sem banco de produção. O E2E compila central/Bora em série, sobe standalone e executa SSO, identidade/contextos, fila IndexedDB, pareamento e treino manual no computador e celular. Evidências ficam em `apps/conta/test-results/compasso-apps/bora-treinar/`. Os runners locais antigos e `preview:setup` foram retirados.

## Estrutura

```
apps/bora-treinar/
├── scripts/
│   ├── fetch-assets.mjs        # WASM e modelo de pose em public/mediapipe
│   ├── maintenance-cron.sh     # cron da cobrança: /api/ready e /api/jobs/billing
│   └── lembretes-cron.sh       # cron dos lembretes: /api/ready e /api/jobs/lembretes
└── src/
    ├── app/api/                # auth, health, ready, jobs, webhooks Stripe e SendGrid, descadastro
    ├── features/
    │   ├── treino/             # núcleo do treino: instrutor, contagem e catálogo
    │   │   ├── body/           # landmarks, poses, esqueleto e cadência
    │   │   ├── engine/         # contador de repetições, runner da sessão, progressão, voz
    │   │   ├── catalog/        # exercícios, trilhas e treinos prontos
    │   │   ├── instructor/     # instrutor 3D (three.js)
    │   │   └── vision/         # rastreador de pose do MediaPipe
    │   ├── familia/            # perfis e preferências
    │   ├── meus-treinos/       # editor de treinos
    │   ├── sessoes/            # registro das sessões e séries
    │   ├── desafios/           # desafio semanal da família
    │   ├── conquistas/         # conquistas por perfil
    │   ├── acesso/             # o que cada plano libera
    │   ├── billing/            # assinatura, troca de plano e manutenção
    │   └── account/, operations/
    └── lib/                    # env, auth, redis, e-mails, observabilidade, job-runs
```

O núcleo de `features/treino` roda todo no navegador; o resto (conta, cobrança, banco, e-mails, auditoria) segue o mesmo desenho da Missão Saber e usa os packages compartilhados (`@informach/auth`, `billing`, `config`, `db`, `emails`). As tabelas ficam no schema `bora_treinar` (`packages/db/src/schema/bora-treinar.ts`) e os históricos pertencem às ativações centrais, sem cascata da conta que os criou.

## Decisões principais

- O detector de pose roda no navegador; o banco guarda só o resultado de cada série (repetições, segundos, avisos de execução), nunca imagem. Antes de prometer em página pública que nenhuma imagem passa pelo servidor, conferir o caminho do pareamento celular → TV.
- Nome e cor vêm da pessoa central; o perfil local guarda preferências de treino. Eventos de auditoria `bora.*` levam IDs, nomes de campo e contagens (ver `docs/audit-payload-policy.md`).
- Sessões web no PostgreSQL, vinculadas à raiz da central e verificadas a cada uso; Redis transporta pareamento, não autenticação.
- Lembretes (`bora.reminder`) e resumo semanal (`bora.weekly-summary`) são montados pelo app no momento do envio e não têm o corpo persistido.
- Rotinas agendadas passam por `recordJobRun` com app `bora-treinar` e jobs `billing` e `lembretes`, que o Bastidores acompanha em Operação.
