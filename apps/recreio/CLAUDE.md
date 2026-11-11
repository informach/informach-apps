# Recreio: guia do app

Leia antes o `AGENTS.md` da raiz, o [README](README.md) (como rodar e verificar) e o [registro da frente](../../docs/recreio/implementacao.md), que guarda o escopo, as decisões e o estado de cada lote. Este guia diz o que o app é e onde cada regra mora.

## O que é

Portal Next.js do Recreio, a plataforma de jogos por assinatura da Informach (`recreio.informach.com.br`). O primeiro jogo é o Morada. Porta local 3009.

O nome do pacote é `@informach/recreio-app`, porque `@informach/recreio` já é o package de domínio. Os scripts da raiz continuam curtos: `pnpm dev:recreio`, `pnpm build:recreio`, `pnpm start:recreio`.

## Onde ficam as regras

- **Domínio e contratos:** `packages/recreio` (`decidirAcesso`, regras de mundo, posse, convite, tokens, API das instâncias). O app não repete essas regras; ele carrega os fatos e chama o package. Leia o [README do package](../../packages/recreio/README.md).
- **Catálogo dos jogos:** `@informach/config/jogos`. O estado de publicação de um jogo não é direito de abrir.
- **Produtos e preços:** `@informach/config/products` (`recreio_*`, ainda `price_TODO_*`). Não existe plano gratuito.
- **Este app:** rotas, sessão, telas e tudo o que grava no schema `recreio` (`packages/db/src/schema/recreio.ts`). Ele é o único a gravar nesse schema; o servidor de um jogo fala com o Recreio por HTTP.

## Camadas

- `src/app`: rotas e composição. Páginas não importam o banco.
- `src/features/<área>`: `components/` (telas), `actions.ts` (server actions), `service.ts` (sem Next), `repository.ts` (banco). Lógica pura fica em arquivo próprio, com teste (`estante/catalogo.ts`, `perfis/regras.ts`, `acesso/cobertura.ts`, `acesso/texto.ts`). O que precisa do Next sem ser ação fica em arquivo próprio da área (`sessao/ator.ts`, `sessao/http.ts`).
- `src/components`: peças visuais sem dados (marca, capa, formulário de entrada, moldura das páginas de texto).
- `src/lib`: o que atravessa o app (auth, env, e-mail, Redis, logger, observabilidade).
- O Biome da raiz verifica as fronteiras: páginas, componentes, ações e rotas não importam `@informach/db`.

## A base (lote P1)

- Conta Informach por `@informach/auth`: senha ou código por e-mail (OTP para confirmar, entrar e redefinir senha), sem organizations. Sessões no Redis (`recreio:auth:`) com o cache de cookie desligado, para que sair ou revogar valha na hora.
- `/` (página pública do alfa), `/entrar`, `/estante` e `/conta` (as duas exigem conta com e-mail confirmado e perfil ativo, conferidos no layout e em cada página), `/termos` e `/privacidade` provisórios.
- `src/proxy.ts` só entrega a CSP com nonce e o caminho de volta do login. A autenticação fica no servidor, em layouts, páginas e ações.
- `/api/health` não toca o banco. `/api/ready` sonda o schema `recreio`, confere a migração esperada (`checkSchemaReadiness`) e o Redis; sem Redis responde 503.
- `/api/email/unsubscribe`: todo e-mail enviado leva esse endereço.
- `RECREIO_ACCESS_MODE` (`fechado` por padrão, ou `aberto`): muda textos e, com `fechado`, faz a estante parar na explicação para quem não tem o direito de jogar. Não é ele que decide quem joga; isso é de `avaliarAcesso`.
- Fora dos buscadores: `INDEXAVEL = false` em `src/lib/seo.ts`, separado do modo de acesso.

## Conta, perfil e sessão de aparelho (lote P2)

São cinco coisas separadas: a conta (`core.users`, do login compartilhado), a assinatura (espelhada pelo `@informach/billing`), o grupo de assinatura, o perfil e a sessão de aparelho. **O jogo só recebe o id do perfil, nunca o da conta.**

- `features/sessao`: `atorAtual()` (em `ator.ts`, com `cache` do React) devolve `{ contaId, sessaoDeAparelhoId, perfil | null }` com os ids de marca de `@informach/recreio`. A sessão de aparelho é uma linha em `recreio.device_sessions`, criada no primeiro pedido de cada sessão do Better Auth. O perfil ativo mora nessa linha e é conferido a cada pedido contra a lista que o servidor monta para a conta (`perfisSelecionaveis`); se saiu da lista, a sessão fica sem perfil. **Nenhum cookie e nenhum campo do pedido leva id de perfil.** `perfilAtivo()` lança `NAO_AUTENTICADO` ou `SEM_PERFIL`; `paginaDaConta()` e `paginaDoPortal()` são as versões que redirecionam.
- `features/perfis`: uma conta tem um perfil de login próprio (adulto), criado junto com o grupo em `/comecar`, numa transação com a conta travada. `/perfis` ("Quem vai jogar?") escolhe o perfil do aparelho; hoje a lista tem só o próprio. O apelido segue `APELIDO` do domínio; os avatares são um conjunto fixo (`avatares.ts`).
- `/(portal)/*` exige perfil ativo: sem perfil vai para `/comecar`; com perfil e sem escolha, para `/perfis`.
- Sair é `POST /api/conta/sair`: encerra a linha da sessão de aparelho (`revoked_at`) e a sessão de login no mesmo pedido. Linha encerrada não volta; com o login ainda de pé, o portal manda entrar de novo.
- Ids de conta, perfil e sessão são todos UUID. O que separa um do outro é a marca do tipo na compilação e, em execução, a consulta (cada id só é procurado na sua tabela, sempre junto com a conta de quem pede). Toda fronteira valida com o esquema Zod do domínio, sem cast.

## Direito de jogar (lote P3)

- `features/acesso/service.ts`: `avaliarAcesso({ profileId, gameId? })` carrega os fatos (perfil, grupo, assinatura do titular pelo `getProSubscription`, concessões) e entrega a `decidirAcesso`. **É o único lugar do app que lê assinatura ou concessão para decidir acesso**; `features/acesso/fronteira.test.ts` falha se outro arquivo de `src` fizer isso. Telas, ingresso e renovação de sessão chamam `avaliarAcesso`.
- Cobertura: o perfil precisa ter grupo, estar com `coverage_enabled` e caber, por ordem de criação, no limite de perfis do plano em vigor (`acesso/cobertura.ts`).
- A cobrança ainda não existe: o `@informach/billing` entra só para a leitura acima. Sem checkout, webhook ou serviço de cobrança; os produtos seguem `price_TODO_recreio_*`.
- Nesta etapa quem joga é quem a equipe liberou: `pnpm --filter @informach/recreio-app conceder --email <e> --tier individual|family --dias <n> --motivo <codigo>` e `revogar --email <e> --motivo <codigo>` (`scripts/`, rodam com `tsx` e só precisam de `DATABASE_URL`). A linha em `recreio.entitlements` e o evento de auditoria entram na mesma transação. Uma concessão vigente por grupo; o motivo é um código curto, nunca texto livre.
- Auditoria: `recreio.profile_created`, `recreio.entitlement_granted` e `recreio.entitlement_revoked`, com os campos de `docs/audit-payload-policy.md`. Nunca apelido, e-mail, IP ou token.
- `/estante` e `/conta` mostram a situação do acesso em texto simples (`acesso/texto.ts`).

## O que ainda não existe

PIN e aparelho pareado, perfis sem login criados pelo titular, edição do perfil, cobrança (Stripe) e webhooks, tokens e JWKS, mundos, convites, `/jogar/*`, API do SDK e das instâncias, jobs, E2E, serviço no Railway e tela no Bastidores (os eventos `recreio.*` aparecem lá sem frase própria). As tabelas de ingresso, sessão de jogo, mundo, posse, fotografia e diário já estão na migração `0080_recreio`, mas nada grava nelas ainda. A exclusão de conta fica desligada (`accountDeletion: { enabled: false }`) até existirem as regras de sucessão do mundo.

Não adiante nada disso fora do lote correspondente do registro da frente.

## Visual

Tom editorial escuro da proposta, com a capa do jogo fazendo o trabalho visual. Tokens `--rc-*` em `src/app/globals.css`; `src/app/tema.test.ts` mede o contraste. Fontes Bricolage Grotesque (títulos) e Plus Jakarta Sans (texto), servidas pela própria origem. Nenhuma arte licenciada entra no repositório: a capa do Morada é um SVG provisório em `src/components/desenhos.tsx`.

Textos em português do Brasil, simples e diretos, sem prometer o que ainda não existe.
