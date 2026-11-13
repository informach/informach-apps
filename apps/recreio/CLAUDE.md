# Recreio: guia do app

Leia antes o `AGENTS.md` da raiz, o [README](README.md) (como rodar e verificar) e o [registro da frente](../../docs/recreio/implementacao.md), que guarda o escopo, as decisões e o estado de cada lote. Este guia diz o que o app é e onde cada regra mora.

## O que é

Portal Next.js do Recreio, a plataforma de jogos por assinatura da Informach (`recreio.informach.com.br`). O primeiro jogo é o Morada. Porta local 3009.

O nome do pacote é `@informach/recreio-app`, porque `@informach/recreio` já é o package de domínio. Os scripts da raiz continuam curtos: `pnpm dev:recreio`, `pnpm build:recreio`, `pnpm start:recreio`.

## Onde ficam as regras

- **Domínio e contratos:** `packages/recreio` (`decidirAcesso`, regras de mundo, posse, convite, tokens, API das instâncias). O app não repete essas regras; ele carrega os fatos e chama o package. Leia o [README do package](../../packages/recreio/README.md).
- **Catálogo dos jogos:** `@informach/config/jogos`. O estado de publicação de um jogo não é direito de abrir. O app pergunta sempre a `features/jogos/config.ts`, que é o catálogo deste deploy (o público mais, só fora de produção e com a variável ligada, o jogo de teste).
- **Produtos e preços:** `@informach/config/products` (`recreio_*`, ainda `price_TODO_*`). Não existe plano gratuito.
- **Este app:** rotas, sessão, telas e tudo o que grava no schema `recreio` (`packages/db/src/schema/recreio.ts`). Ele é o único a gravar nesse schema; o servidor de um jogo fala com o Recreio por HTTP.

## Camadas

- `src/app`: rotas e composição. Páginas não importam o banco.
- `src/features/<área>`: `components/` (telas), `actions.ts` (server actions), `service.ts` (sem Next), `repository.ts` (banco). Lógica pura fica em arquivo próprio, com teste (`estante/catalogo.ts`, `perfis/regras.ts`, `acesso/cobertura.ts`, `acesso/texto.ts`). O que precisa do Next sem ser ação fica em arquivo próprio da área (`sessao/ator.ts`, `sessao/http.ts`).
- `src/components`: peças visuais sem dados (marca, capa, formulário de entrada, moldura das páginas de texto).
- `src/lib`: o que atravessa o app (auth, env, chaves dos tokens, respostas HTTP, e-mail, Redis, limite de tentativas, logger, observabilidade). `lib/repository.ts` é o apoio dos repositórios (transação, travas, relógio do banco) e só eles o importam.
- O Biome da raiz verifica as fronteiras: páginas, componentes, ações e rotas não importam `@informach/db`.

## A base (lote P1)

- Conta Informach por `@informach/auth`: senha ou código por e-mail (OTP para confirmar, entrar e redefinir senha), sem organizations. Sessões no Redis (`recreio:auth:`) com o cache de cookie desligado, para que sair ou revogar valha na hora.
- `/` (página pública do alfa), `/entrar`, `/estante` e `/conta` (as duas exigem conta com e-mail confirmado e perfil ativo, conferidos no layout e em cada página), `/termos` e `/privacidade` provisórios.
- `src/proxy.ts` só entrega a CSP com nonce e o caminho de volta do login. A autenticação fica no servidor, em layouts, páginas e ações. A política é montada em `lib/csp.ts`.
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

## Ingresso e sessão de jogo (lote P4)

Princípios que não se negociam: **o jogo recebe um ingresso, nunca acesso ao banco; o jogo só conhece o id do perfil** (nunca conta, e-mail, idade, grupo ou cobrança); **o perfil ativo sai sempre da sessão conferida no servidor**; **saber um id não dá acesso** (toda rota confere o escopo de novo, e "existe mas não é seu" responde igual a "não existe").

- `features/jogos/config.ts`: o que o app sabe de um jogo ao atender um pedido, juntando o manifesto (`@informach/config/jogos`) e o deploy (`RECREIO_HOST_SECRETS`, `RECREIO_GAME_ORIGINS`). Sessões, mundos e posse perguntam aqui. Jogo em `em_breve`, `manutencao` ou `aposentado` não abre.
- `lib/tokens.ts`: `chavesDoRecreio()` carrega a chave uma vez por processo. A pública do JWKS sai da privada. Fora de produção, sem a variável, gera um par descartável e avisa no log; em produção a falta dela é erro de ambiente.
- Rotas em `src/app/api/sdk/v1`. Todas respondem JSON; recusa é `{ codigo, estado?, motivo?, detalhe? }` com o status de `statusDoErro` (`lib/http.ts`). Corpo e parâmetros são conferidos com os esquemas de `@informach/recreio/contrato`.
  - `GET jwks`: chave atual e anteriores, `Cache-Control: public, max-age=300`.
  - `POST ingresso`: **a única autenticada pelo cookie**, e por isso só atende a própria origem. `perfilAtivo()`, `avaliarAcesso`, jogo que abre, linha em `game_tickets`, token de 60 s.
  - `POST sessao`: autenticada pelo ingresso. A troca é uma transação (`abrirSessaoComIngresso`): consome o `jti` (uma vez, no prazo, e do mesmo perfil, aparelho e jogo que o token diz), confere e trava a sessão de aparelho, encerra a sessão anterior se veio `continuarAqui` (senão `JA_ABERTO`, e o ingresso não é gasto) e insere a nova.
  - `POST sessao/renovar` e `POST sessao/sair`: token da sessão em `Authorization: Bearer`. A renovação confere a linha da sessão, a sessão de aparelho, a sessão de login por trás dela e o direito de jogar; se algo caiu, encerra a sessão ali mesmo e responde 403 `ACESSO_PERDIDO`.
- A sessão de login é conferida **sem cookie** por `conferirSessaoDeAparelho` (`features/sessao/service.ts`), com `isAuthSessionLive` de `@informach/auth/sessions`: no Redis do app quando ele existe, senão em `core.sessions`. É isso que pega o login encerrado por outro caminho (expiração, Bastidores), que não marca `revoked_at`.
- **Encerrar uma sessão de jogo** grava `ended_at`, `end_reason` e `ended_seq` num comando só, sempre por `encerrarSessoesAbertas` (`sessao-de-jogo/repository.ts`), atrás de uma trava de transação única. A sequência entrega o número antes do commit; a trava faz os números serem confirmados na ordem em que foram entregues, e o batimento de uma instância que lê "depois do cursor" nunca pula um. Quem vai encerrar pega a trava antes de tocar em linhas de `game_sessions`.
- Sair da conta (`/api/conta/sair`) encerra, na mesma transação, as sessões de jogo daquela sessão de aparelho (`signed_out`).
- `sessaoDeJogo(request)` (`sessao-de-jogo/http.ts`) é quem diz, nas rotas do SDK, o perfil, o `sid` e o jogo de quem pede, e exige a sessão aberta.
- O acesso é avaliado imediatamente antes de cada transação, não dentro dela: `avaliarAcesso` usa o pool, e pedir uma segunda conexão com uma transação aberta trava o app quando o pool enche. Dentro de uma transação só se usa a própria transação.

## Mundos, membros e convites (lote P5)

- `features/mundos`: `service.ts` é chamado pelas rotas do SDK (sessão de jogo) e pelas ações do portal (cookie). Quem chama entrega o perfil já conferido; nenhum id de perfil vem do pedido.
- Rotas: `GET` e `POST /api/sdk/v1/mundos`, `POST /api/sdk/v1/mundos/{id}/convites`, `POST /api/sdk/v1/convites/aceitar` (token da sessão de jogo ou cookie do portal). Telas: a estante lista os mundos do Morada, com "Criar mundo" e "Entrar com código"; `/mundos/[id]` mostra quem participa e, para o responsável, gera o código; `/convite?codigo=` traz o código preenchido e espera a pessoa confirmar.
- Criar: teto `limites.mundosCriadosPorPerfil` do manifesto, por jogo, contado sob uma trava por perfil (`LIMITE_DE_MUNDOS`). O mundo nasce `hibernating`, com a política de mundo pedida se o jogo a oferece, senão a padrão.
- Convidar: **só o responsável, só `member`** nesta etapa (`visit` dá `SEM_PERMISSAO`). O código vale 24 h e uma vez; o banco guarda só um HMAC dele (`mundos/codigo.ts`). Quem não é membro ativo, mundo de outro jogo e mundo que não existe dão a mesma recusa (`NAO_MEMBRO`).
- Aceitar: a linha do mundo é travada antes da do convite. Código errado, vencido, usado ou revogado: `CONVITE_INVALIDO`, sempre igual. Depois `JA_MEMBRO` e `MUNDO_CHEIO` (`capacidades.mundos.membrosMax`), que não gastam o convite. Quem já saiu do mundo (`former`) volta na mesma linha de membro. As tentativas são contadas por perfil, dez a cada dez minutos (`lib/rate-limit.ts`, o contador de `@informach/auth`: Redis quando existe, senão `core.rate_limit`).
- Auditoria na mesma transação da mudança. **Evento de mundo não leva `targetId`**: liga-se a uma pessoa só pelo ator.

## Posse e API das instâncias (lote P6)

O contrato é o `ClienteDoHost` do package, e a implementação é conferida pela suíte de conformidade (`test/conformidade.integration.ts`). Se o comportamento daqui e o da plataforma em memória divergirem, a suíte é quem manda.

- Rotas em `src/app/api/interno/v1`, só para servidores de jogo: `Authorization: Bearer <segredo do jogo>` comparado em tempo constante, jogo em `X-Recreio-Jogo`, instância em `X-Recreio-Instancia` (`features/posse/http.ts`). Sem cookie e sem conferência de origem. O segredo de um jogo só alcança instâncias e mundos daquele jogo: mundo de outro jogo responde `NAO_ENCONTRADO`, instância de outro jogo `NAO_AUTENTICADO`.
- **A regra central** (`features/posse/repository.ts`): toda operação de uma instância sobre um mundo trava a linha do mundo (`FOR UPDATE`) e exige, na mesma transação, a posse aberta com aquela cerca, daquela instância, reivindicada e dentro do prazo. Fora disso é `POSSE_PERDIDA` e nada muda. O prazo é julgado com `clock_timestamp()`: `now()` é a hora do começo da transação, e quem esperou a trava seria julgado com hora velha.
- Ordem das travas no app: linha da conta em `core.users` (quando entra), linha do mundo em `spaces`, depois o resto.
- `POST /api/sdk/v1/mundos/{id}/abrir` (navegador): com o mundo travado, entra na posse vigente ou fecha a vencida (`expired`), sobe `lease_epoch` e atribui a posse à instância ativa, vista dentro do prazo, com vaga e com menos mundos. Sem nenhuma: `SEM_INSTANCIA`, e nada fica pela metade. A resposta não leva a cerca. A retomada nunca espera a manutenção.
- O batimento renova cada posse com um comando condicionado à mesma linha que a retomada fecha: renovar e retomar nunca acontecem as duas. Pode não acontecer nenhuma (a abertura encontra a posse no prazo e o batimento chega depois do vencimento): a dona já se cercou e a próxima abertura retoma, ao custo de uma reconexão. Também soma jogadores por segundo e o pico, e devolve as sessões de jogo encerradas depois do cursor. Sem cursor valem as encerradas desde o registro da instância.
- Uma instância só se registra com o endereço de `RECREIO_GAME_ORIGINS[jogo].ws`.
- Diário: contínuo a partir de `journal_seq + 1`, tudo ou nada; repetir exatamente uma entrada gravada (ou já compactada) não faz nada. Fotografia: só sobre a `revisaoEsperada`; o `sha256` é calculado aqui; ficam as 5 mais novas e as fixadas, e o diário é compactado até a mais antiga guardada. Os tetos vêm de `limites` do manifesto.
- `features/posse/armazenamento.ts` é a porta das fotografias e do diário; `armazenamento-repository.ts` é a implementação no Postgres (`storage = 'pg'`). A variante com bucket não existe.
- `POST /api/jobs/manutencao` (`CRON_SECRET`, registrado em `ops.job_runs`): posses vencidas, instâncias caladas há mais de dois prazos (`gone`; se voltarem a bater, ficam `active` de novo), ingressos com mais de um dia, sessões de jogo sem renovação. Idempotente, só contagens.
- Auditoria: `recreio.space_lease_taken_over` na transação da retomada; `recreio.space_write_refused` quando uma instância autenticada escreve sem a posse.

## Página do jogo (lote P7)

- `/jogar/[jogo]?mundo=<id>` (`src/app/jogar/[jogo]/page.tsx`) fica fora de `(portal)`: o jogo ocupa a janela inteira, sem o cabeçalho do portal. Exige o mesmo que as páginas do portal (`paginaDoPortal()`). `features/jogar/service.ts` decide no servidor, nesta ordem: jogo que não existe neste deploy, não abre ou não tem cliente no portal é 404; perfil sem o direito de jogar volta para a estante, que já explica; sem `?mundo=` volta para a estante; mundo que não existe, é de outro jogo ou do qual o perfil não participa mostra o mesmo aviso ("Este mundo não está disponível").
- **Nada de quem joga é escrito na página.** O componente recebe o id do jogo, o id do mundo e os nomes dos dois. O perfil chega ao jogo pelo ingresso, que o navegador pede com o cookie (`features/jogar/ingresso.ts`).
- `features/jogar/components/hospedeiro.tsx` pede o ingresso, chama `criarRecreio`, baixa o cliente do jogo e o monta. Os estados e os textos ficam em `features/jogar/estado.ts` (máquina pura, com teste): abrindo, "Você já está jogando em outro lugar" (`JA_ABERTO`, com "Continuar aqui"), jogando, saindo e parado com o motivo (sem acesso, jogo ou mundo indisponível, "O jogo está iniciando" para `SEM_INSTANCIA`, acesso perdido, continuou em outro lugar, saiu da conta, rede).
- **Um perfil tem uma sessão de jogo por vez.** Tudo o que tira o jogo da tela (sair, falha, troca de página, `pagehide`) desmonta o jogo e chama `sair()` antes de qualquer nova tentativa; as tentativas correm em fila. Sem isso, "Tentar de novo" esbarraria em `JA_ABERTO` contra a própria sessão.
- **Contrato com o cliente de um jogo:** `ModuloDoJogo` em `@informach/recreio/sdk` (`montar(host, contexto, { mundoId, aoSair, aoFalhar })` devolve `{ dispose() }`). O jogo abre o mundo e fala com o próprio servidor; o que ele não resolve sozinho entrega em `aoFalhar` (em geral o `ErroDoRecreio` que recebeu), e a página explica.
- A lista dos clientes fica em dois arquivos que andam juntos (`registro.test.ts` confere): `features/jogar/registro.ts` tem só os ids e é o que o **servidor** pergunta (`temCliente`, na estante, na página de um mundo e na página do jogo); `features/jogar/carregadores.ts` liga cada id a um `import()` dinâmico e **só o hospedeiro o importa**. Se uma página de servidor importasse os carregadores, o Next seguiria o `import()` e tentaria compilar o cliente do jogo como componente de servidor (o build falha). Cada linha dos carregadores aponta para um adaptador de `features/jogar/adaptadores/`: **o portal não importa o pacote de um jogo em nenhum outro lugar**, e o código de um jogo nunca entra no bundle comum (o E2E confere). Jogo do catálogo sem id no registro não tem página.
- `ModuloDoJogo.saidaPropria`: o jogo que tem o próprio controle de saída em todas as telas dele declara isso, e a página não desenha o botão "Sair" dela por cima do jogo. Um caminho de saída, não dois.
- **Entrar e sair da página do jogo é sempre carga de documento** (`<a href>` ou `window.location`), nunca o `Link` do Next: a política de segurança é do documento, e uma navegação do roteador manteria a política da página anterior.
- CSP só desta rota (`lib/csp.ts`, com teste das duas políticas): `script-src` ganha `'wasm-unsafe-eval'`; `connect-src` ganha a origem de `RECREIO_GAME_ORIGINS[jogo].ws` e a de `assets`, se declarada; `worker-src` ganha `blob:`; `img-src` e `media-src` ganham `blob:` (e a origem da arte). As outras páginas continuam com a política de antes, letra por letra.
- `lib/zod-sem-eval.ts`: no navegador o Zod roda com `jitless`. Sem isso ele testa `new Function` na primeira conferência de um objeto e a CSP registra uma violação. Todo componente de navegador que usa o SDK importa esse arquivo.
- **Jogo de teste** (`teste`): um contador por mundo com a lista de quem está presente, para provar a plataforma sem código de jogo. Manifesto em `features/jogos/catalogo.ts` (não entra em `@informach/config/jogos`), cliente em `features/jogo-de-teste`, servidor em `e2e/servidor/main.ts`. Só existe com `RECREIO_JOGO_DE_TESTE=1`, que a validação do ambiente recusa num serviço publicado e em qualquer `NODE_ENV=production` que não seja a verificação isolada em localhost. O cliente só é empacotado num build feito com a variável (`next.config.ts` grava `RECREIO_CLIENTE_DE_TESTE`). Com ela desligada, ingresso, mundos, instâncias e `/jogar/teste` respondem como a um jogo desconhecido.
- A estante lista os mundos de cada jogo do catálogo do deploy. "Jogar" aparece em cada mundo, na estante e em `/mundos/[id]`, quando o perfil pode jogar, o jogo abre e o portal tem o cliente dele. O cartão do jogo aponta para os mundos.
- E2E (`pnpm --filter @informach/recreio-app e2e`): build de produção com o jogo de teste, banco descartável, Chromium (desenho por software, para o WebGL) e o servidor de cada jogo como processo que o teste inicia, derruba com sinal e reinicia. `e2e/jogar.spec.ts` prova a plataforma com o jogo de teste; `e2e/morada.spec.ts`, o Morada de verdade. O que é comum fica em `e2e/apoio.ts`. Todo teste falha se o navegador registrar violação da CSP ou erro de página.

## Morada na página do jogo (lote X1)

- `features/jogar/adaptadores/morada.ts` traduz `ModuloDoJogo` para `montarMorada`, do `@informach/jogo-morada`. É o único arquivo do portal que importa o pacote do jogo (e `morada-regra.ts`, só os tipos). O jogo de verdade (three.js, HUD, CSS) vem por um segundo `import()`, dentro de `montarMorada`. `next.config.ts` lista `@informach/jogo-morada` e `@informach/morada-sim` em `transpilePackages`.
- O cliente é montado **sem `depurar`**, como em produção, também no E2E. Os testes conferem o jogo pelo HUD e pelos atributos `data-morada-*` (lista no README do `jogo-morada`).
- O adaptador marca o elemento do jogo com `MARCA_DO_CLIENTE` (`data-jogo`). O E2E procura a marca e um nome do three.js nos scripts de cada página: a estante não baixa nenhum dos dois; `/jogar/morada` baixa os dois.
- O Morada declara `saidaPropria`: a saída é o "Sair" do trilho de ferramentas dele (e dos cartões de entrada e de reconexão, antes de o mundo aparecer). O foco do teclado começa na cena quando o mundo aparece.
- O Zod do jogo é o mesmo módulo do portal: o hospedeiro importa `lib/zod-sem-eval.ts` antes de baixar qualquer cliente, e o conteúdo que o jogo confere ao carregar não dispara violação da CSP.

**Quem fala quando o jogo para** (`features/jogar/adaptadores/morada-regra.ts`, com teste). A pessoa nunca lê dois avisos da mesma coisa nem fica diante de uma tela muda:

- **Queda passageira é do jogo.** Depois que o mundo apareceu, rede que cai, instância que reinicia ou morre e Recreio que não responde ou ainda não tem instância (`INDISPONIVEL`, `SEM_INSTANCIA`, `MUITAS_TENTATIVAS` ao reabrir) ficam com o jogo: ele mostra a faixa dele, com a casa na tela, e tenta de novo sozinho. A página não diz nada.
- **O que é definitivo, e o que só a plataforma sabe explicar, é da página.** O adaptador tira o jogo da vista e entrega um `ErroDoRecreio` em `aoFalhar`; a página desmonta o jogo e mostra o aviso dela:
  - qualquer recusa ao abrir o mundo **antes** de ele aparecer, inclusive `SEM_INSTANCIA` ("O jogo está iniciando") e rede;
  - recusa definitiva ao reabrir (`NAO_MEMBRO`, `MUNDO_INDISPONIVEL`, acesso, sessão);
  - todo fim que o servidor do jogo declara. Outra conexão do mesmo jogador (4012) vira `SESSAO_ENCERRADA` com `replaced` ("Você continuou o jogo em outro lugar"). Sessão recusada (4001), sem acesso ao mundo (4003) e acesso encerrado chegam sem o motivo do Recreio: o adaptador **pergunta ao Recreio** com a sessão de jogo (`mundos.listar()`), e a recusa traz o motivo (`replaced`, `signed_out`, `access_lost`...); se o mundo saiu da lista, `NAO_MEMBRO`. Sem resposta em 4 s, vale o aviso padrão do caso. Se o próprio SDK já avisou (`aoMudarAcesso`), não pergunta.
- **Uma vez.** Depois da primeira falha entregue, ou de sair, o adaptador não repassa mais nada.

Mudou a regra, mude o teste e este texto.

**Arte (lote X2).** `prepararPaginaDoJogo` devolve `jogo.origemDaArte` (`RECREIO_GAME_ORIGINS[jogo].assets`, ou `null`), o hospedeiro a passa em `OpcoesDeMontagem.origemDaArte` e o adaptador a entrega ao jogo. É a mesma origem que a CSP desta rota libera. O jogo baixa a arte do servidor dele com a sessão de jogo; o portal nunca vê nem serve arte. Sem `assets`, o Morada desenha os corpos procedurais, e é assim no CI e no E2E.

## O que ainda não existe

PIN e aparelho pareado, perfis sem login criados pelo titular, edição do perfil, cobrança (Stripe) e webhooks, serviço e agendador no Railway e tela no Bastidores (os eventos `recreio.*` aparecem lá sem frase própria). Nos mundos: convite de visita, convite por membro com aprovação, coadministradores, sair de um mundo, remover membro, arquivar e a sucessão do responsável. No armazenamento: bucket. A exclusão de conta fica desligada (`accountDeletion: { enabled: false }`) até existirem as regras de sucessão do mundo.

Não adiante nada disso fora do lote correspondente do registro da frente.

## Visual

Tom editorial escuro da proposta, com a capa do jogo fazendo o trabalho visual. Tokens `--rc-*` em `src/app/globals.css`; `src/app/tema.test.ts` mede o contraste. Fontes Bricolage Grotesque (títulos) e Plus Jakarta Sans (texto), servidas pela própria origem. Nenhuma arte licenciada entra no repositório: a capa do Morada é um SVG provisório em `src/components/desenhos.tsx`.

Textos em português do Brasil, simples e diretos, sem prometer o que ainda não existe.

## Revisão de 13/11/2026

- A emissão de ingresso limita cada perfil a 20 pedidos por minuto, pelo mesmo armazenamento de limites do app.
- A renovação confere se o jogo continua aberto; manutenção encerra a sessão com `access_lost`, entrega `JOGO_INDISPONIVEL` e aparece no cursor de encerramentos da instância.
- A entrada autorizada pela instância reavalia o direito de jogar, depois de conferir escopo, sessão e perfil, preservando as recusas que não revelam a existência de outro perfil/mundo.
- A guarda compartilhada de `@informach/auth` impede excluir, por outro produto, uma conta que tenha perfil no Recreio. Até implementar sucessão/saída de mundos, a exclusão é assistida pelo suporte; o Recreio continua com a exclusão automática desligada.
- O E2E isolado serve o Next standalone com `public` e `static` copiados e sobe `dist/main.mjs` do Morada. Implantação preparada em [PRODUCAO.md](PRODUCAO.md), ainda sem serviço publicado.


## Arte da casa e verificação privada (D1)

O portal continua só declarando `RECREIO_GAME_ORIGINS.morada.assets`; o jogo baixa a arte autenticada diretamente do servidor dele. Quando há origem de arte válida, `connect-src` também aceita `blob:`: o `GLTFLoader/ImageBitmapLoader` faz `fetch` das texturas embutidas. Outras páginas e jogos sem origem de arte continuam com a política anterior.

O runner isolado aceita `RECREIO_E2E_ARTE_DIR=<pasta externa com manifest.json>`. Ele declara a origem HTTP da arte, entrega a pasta ao servidor do Morada e cria a pasta de evidências fora do checkout. Capturas manuais, screenshots automáticos e traces seguem para lá; o CI padrão continua sem arte. A rede fictícia de cada conta de teste (`x-real-ip`) só é aplicada à origem do portal, nunca à origem da arte. A jornada com arte confere os modelos e acabamentos carregados, as portas/janelas e a CSP, além de repetir as quedas.
