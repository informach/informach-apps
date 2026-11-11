# Recreio: guia do app

Leia antes o `AGENTS.md` da raiz, o [README](README.md) (como rodar e verificar) e o [registro da frente](../../docs/recreio/implementacao.md), que guarda o escopo, as decisões e o estado de cada lote. Este guia diz o que o app é e onde cada regra mora.

## O que é

Portal Next.js do Recreio, a plataforma de jogos por assinatura da Informach (`recreio.informach.com.br`). O primeiro jogo é o Morada. Porta local 3009.

O nome do pacote é `@informach/recreio-app`, porque `@informach/recreio` já é o package de domínio. Os scripts da raiz continuam curtos: `pnpm dev:recreio`, `pnpm build:recreio`, `pnpm start:recreio`.

## Onde ficam as regras

- **Domínio e contratos:** `packages/recreio` (`decidirAcesso`, regras de mundo, posse, convite, tokens, API das instâncias). O app não repete essas regras; ele carrega os fatos e chama o package. Leia o [README do package](../../packages/recreio/README.md).
- **Catálogo dos jogos:** `@informach/config/jogos`. O estado de publicação de um jogo não é direito de abrir.
- **Produtos e preços:** `@informach/config/products` (`recreio_*`, ainda `price_TODO_*`). Não existe plano gratuito.
- **Este app:** rotas, sessão, telas e, a partir dos próximos lotes, tudo o que grava no schema `recreio`. Ele será o único a gravar nesse schema; o servidor de um jogo fala com o Recreio por HTTP.

## Camadas

- `src/app`: rotas e composição. Páginas não importam o banco.
- `src/features/<área>`: `components/` (telas), `actions.ts` (server actions), `service.ts` (sem Next), `repository.ts` (banco). Lógica pura fica em arquivo próprio, com teste (`estante/catalogo.ts`).
- `src/components`: peças visuais sem dados (marca, capa, formulário de entrada, moldura das páginas de texto).
- `src/lib`: o que atravessa o app (auth, env, e-mail, Redis, logger, observabilidade).
- O Biome da raiz verifica as fronteiras: páginas, componentes, ações e rotas não importam `@informach/db`.

## O que já existe (lote P1)

- Conta Informach por `@informach/auth`: senha ou código por e-mail (OTP para confirmar, entrar e redefinir senha), sem organizations. Sessões no Redis (`recreio:auth:`) com o cache de cookie desligado, para que sair ou revogar valha na hora.
- `/` (página pública do alfa), `/entrar`, `/estante` e `/conta` (as duas exigem conta com e-mail confirmado, conferido no layout e em cada página), `/termos` e `/privacidade` provisórios.
- `src/proxy.ts` só entrega a CSP com nonce e o caminho de volta do login. A autenticação fica no servidor, em layouts, páginas e ações.
- `/api/health` não toca o banco. `/api/ready` confere a migração esperada (`checkSchemaReadiness`) e o Redis; sem Redis responde 503.
- `/api/email/unsubscribe`: todo e-mail enviado leva esse endereço.
- `RECREIO_ACCESS_MODE` (`fechado` por padrão, ou `aberto`): com `fechado`, as telas avisam que o acesso é por convite da equipe. Não é ele que decide quem joga; isso será de `decidirAcesso`.
- Fora dos buscadores: `INDEXAVEL = false` em `src/lib/seo.ts`, separado do modo de acesso.

## O que ainda não existe

Schema `recreio` e migrações, perfis, sessão de aparelho e PIN, concessões e direito de jogar, cobrança (Stripe) e webhooks, tokens e JWKS, mundos, convites, `/jogar/*`, API do SDK e das instâncias, jobs, auditoria própria (`recreio.*`), testes de integração e E2E, serviço no Railway e tela no Bastidores. A exclusão de conta fica desligada (`accountDeletion: { enabled: false }`) até existirem as regras de sucessão do mundo.

Não adiante nada disso fora do lote correspondente do registro da frente.

## Visual

Tom editorial escuro da proposta, com a capa do jogo fazendo o trabalho visual. Tokens `--rc-*` em `src/app/globals.css`; `src/app/tema.test.ts` mede o contraste. Fontes Bricolage Grotesque (títulos) e Plus Jakarta Sans (texto), servidas pela própria origem. Nenhuma arte licenciada entra no repositório: a capa do Morada é um SVG provisório em `src/components/desenhos.tsx`.

Textos em português do Brasil, simples e diretos, sem prometer o que ainda não existe.
