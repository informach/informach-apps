# Recreio: guia do app

Leia antes o `AGENTS.md` da raiz, o [README](README.md) (como rodar e verificar) e o [registro da frente](../../docs/recreio/implementacao.md), que guarda o escopo, as decisões e o estado de cada lote. Este guia diz o que o app é e onde cada regra mora.

## O que é

Portal Next.js do Recreio, a plataforma de jogos por assinatura da Informach (`recreio.informach.com.br`). O primeiro jogo é o Morada. Porta local 3009.

O nome do pacote é `@informach/recreio-app`, porque `@informach/recreio` já é o package de domínio. Os scripts da raiz continuam curtos: `pnpm dev:recreio`, `pnpm build:recreio`, `pnpm start:recreio`.

## Onde ficam as regras

- **Domínio e contratos:** `packages/recreio` (`decidirAcesso`, regras de mundo, posse, convite, tokens, API das instâncias). O app não repete essas regras; ele carrega os fatos e chama o package. Leia o [README do package](../../packages/recreio/README.md).
- **Catálogo dos jogos:** `@informach/config/jogos`. O estado de publicação de um jogo não é direito de abrir. O app pergunta sempre a `features/jogos/config.ts`, que é o catálogo deste deploy (o público mais, só fora de produção e com a variável ligada, o jogo de teste).
- **Produtos e preços:** `@informach/config/products` (`recreio_*`), com as quatro variáveis de preço registradas no catálogo. Individual R$ 59,90/mês ou R$ 599/ano; Família R$ 127,90/mês ou R$ 1.279/ano. Não existe plano gratuito permanente.
- **Fechamento da plataforma:** [escopo vigente](../../docs/recreio/fechamento-plataforma-2026-11-16.md). O titular confirmou os quatro preços e responsabilidade declarada pelo adulto; conta pagante não precisa ocupar perfil de jogador. Estas decisões não declaram os fluxos familiares/comerciais concluídos. SDK independente com dados opacos/conflitos/conquistas implantado em `6b51dd13`; migração 0167 e 168 recibos conferidos na [evidência operacional](../../docs/recreio/dados-de-perfil-2026-11-16.md). Leitores familiares e autoridade de mundos implantados em `ad37ca93`, com famílias desligadas e 175 recibos/0174 conferidos; [prova atual](../../docs/recreio/leitores-protegidos-2026-11-17.md). Checkpoint e o restante do plano continuam em implementação.
- **Este app:** rotas, sessão, telas e tudo o que grava no schema `recreio` (`packages/db/src/schema/recreio.ts`). Ele é o único a gravar nesse schema; o servidor de um jogo fala com o Recreio por HTTP.

Composição comercial candidata: `RECREIO_BILLING_MODE=live` só admite
`STRIPE_MODE=prod`, chave live, origem segura, autenticação live e catálogo
configurado. Sandbox continua exclusivamente dev/test. Off/setup não enviam
compras/trocas; gestão e recuperação financeira existentes continuam separadas
de novas vendas. Esta capacidade ainda está em qualificação e não foi ativada;
Checkout humano e catálogo/portal/webhook Live reais continuam pendentes.

## Camadas

Em candidata, o cancelamento nativo da renovação tem recibo durável próprio,
aceite recente do pagante sem jogador, idempotência, auditoria estrita,
provider Stripe limitado ao contrato original, worker privado e interface.
Aceite, tentativa e confirmação são fatos distintos. APIs reais de teste
44626969668/44647994843 comprovaram parada, replay, término e inventário completo;
não comprovam Checkout humano, webhook ou operação Live. Portal nativo separado,
capacidades antigas e ativação ainda precisam de homologação; o modo padrão
continua legado/off. [Plano](../../docs/recreio/cancelamento-nativo-2026-11-19.md).

Na candidata F7, `features/direitos` mantém a prévia e a confirmação de
retirada separadas em `/conta/dados`. Consentimento/outbox, fotos/resumo/diário,
minimização, expurgo e conclusão preservam as retenções originais. Drenagem
fecha entradas e espera a posse atual; se o host cair, recuperação tipada do
sufixo já durável produz nova foto sem descartar a origem. Mundos locais são
comparados com os IDs/jogos do plano assinado antes de qualquer efeito.

`processar-direitos` é privado/off por padrão. A confirmação exige capacidade
separada `RECREIO_RIGHTS_CONSENT_MODE=native`, custódia completa e livro aberto
conferido. Nenhum argumento ou formulário cria livro/consentimento implícito.
O plano externo imutável passou no bucket real em 44577680233, com limpeza;
não é reaplicação nativa num banco restaurado.

As cópias pessoais do perfil e da conta/pagante usam fotografia SQL consistente,
projeções explícitas e páginas limitadas, sem conteúdo compartilhado, contratos
de outro adulto ou credenciais. O artefato AES-GCM de dez minutos fica em
`personal_exports`, ligado ao login/aparelho/revisão de participação e, quando
aplicável, perfil/política/responsabilidade atuais. Revalidar antes de abrir e
antes de entregar os bytes; nova captura substitui a anterior. Download é POST
da mesma origem e manutenção expurga o corpo/recibo no prazo original.
`RECREIO_EXPORT_MODE=off` e keyring próprio por padrão. 0239 acrescenta a revisão de participação; 0240 adiciona onze índices de
ator/cursor. São 241 recibos candidatos, nenhum aplicado em produção.
As projeções de denúncias/recursos próprios e seis fontes de aprovação foram
qualificadas, com índice UUID/autor sem forçar o otimizador entre 8.000 atos
alheios. Concessões próprias e recibos/prazos técnicos passaram direitos e
navegador nativo em 04dd3987/44760442710. Pareamentos/avisos/convites pessoais
estão no incremento seguinte. A [matriz das 77 fontes](../../docs/recreio/cobertura-dados-pessoais-2026-11-20.md)
conserva lacunas e revisão de retenções; download não declara integralidade.

A barreira `account_participations` distingue atividade, direitos e gestão
financeira. Novas operações exigem active atual. Encerramento público exige
prévia V2, três aceites separados, autenticação nativa recente e capacidade
`RECREIO_ACCOUNT_CLOSURE_MODE=native`, off por padrão, com custódia/livro e
processadores financeiros completos. A mesma TX grava consentimento, cerca,
outbox e conferência financeira. Efeitos nos perfis só começam depois da
confirmação financeira própria; mundos são liberados após o último sujeito.
Limpeza de conta em lotes e conclusão closed3/operação completed são atômicas
com auditoria. Identidade global, períodos/recibos financeiros, terceiros e
referências técnicas nos prazos originais permanecem preservados.

3b192f43 passou direitos/qualidade 44647230157/44647234026; navegador nativo
44647990093 provou consentimento/action/CLI reais com e sem jogador, terceira
conta preservada e nova cópia depois de closed. Prefixo externo completo e
limpeza de nove objetos exclusivos foram comprovados; quatro capturas móveis
inspecionadas. Nenhum dado de produção ou segredo financeiro real foi usado.
Reaplicação nativa antes de tráfego, cobertura formal, custódia/agenda/alertas,
custo, gates finais e implantação permanecem abertos. Nenhuma destas capacidades
foi ativada em produção. [Plano e evidências](../../docs/recreio/encerramento-conta-2026-11-19.md).

Autoridade recente própria ou responsabilidade explícita independe de
assinatura/gameplay. A conta do adulto pode administrar com zero jogadores;
contexto infantil não ganha gestão ao retirar um perfil. Conservar mutex dos
dados antes do aparelho, integridade e auditoria estritas. [Recortes pessoais](../../docs/recreio/direitos-implementacao-2026-11-18.md).

Na candidata F8, `features/objetos/criptografia.ts` oferece o envelope
AES-256-GCM limitado em memória, com contexto autenticado, rotação de chaves e
referência de integridade. `features/objetos/s3.ts` transporta e relê o envelope
com prazo/corpo limitados e recuperação separada. Os 26 testes fechados passaram. Leitura em duas etapas, recuperação histórica,
checkpoint/retenção e entrega auditada passaram em 53 cenários nativos/1226
integrações em `44443406913`, quality `44443402920` aprovado. Não concede
autorização de conteúdo nem significa implantação do armazenamento.
Bucket isolado de homologação provisionado; prova externa `44433527147`
aprovada com escrita condicionada, negativa anônima e limpeza confirmada.
A prova nativa `44444276302` combinou o executor, PostgreSQL descartável e o
bucket real, com espera persistida de cinco minutos, leitura pela composição
servidora, revogação e limpeza confirmadas. `RECREIO_OBJECTS_MODE` nasce `off`
e só admite `read`; nenhum job ou modo de migração foi habilitado. Em candidatas
posteriores, captura protegida, publicação durável, coleta e retirada restritas
passaram em banco descartável e no bucket de homologação. A recuperação em
cluster novo e a normalização offline de fotos também têm prova sintética.
Custódia real, autoridades, replay de direitos, agenda, RPO/RTO e corte continuam
abertos. Confira fontes e limites no [protocolo F8](../../docs/recreio/backup-e-retirada-2026-11-19.md)
e na [normalização offline](../../docs/recreio/normalizacao-recuperacao-2026-11-19.md).
[Escopo e integração pendente](../../docs/recreio/objetos-privados-2026-11-18.md).

Origem histórica de recuperação em implementação: a operação terá uma única
proveniência, preparação interativa ou fonte importada vinculada à execução.
Não recriar usuário/mundo ausente, falsificar login ou usar o operador como
solicitante. Leitura de plano histórico não autoriza efeitos; os workers
interativos recusam essa fonte e continuam exigindo cabeçalho aberto/chave
corrente. [Fases, prova preparada e lacunas](../../docs/recreio/reaplicacao-nativa-2026-11-20.md).

Gestão da conta usa `paginaDaGestao`, com sessão nativa e perfil jogador opcional;
o layout não exige jogador. Estante e mundos adultos conferem `paginaDoPortal`
por página; a página do jogo usa `paginaDoJogador`, com referência restrita
nativa ou pareada e nova admissão no kernel. Aparelhos revalida identidade, vínculo, login e
prazo no repository e não depende da existência ou cobertura de um jogador.
Selecionar perfil infantil ou usar credencial pareada não concede essa gestão.
[Estado do incremento](../../docs/recreio/gestao-sem-perfil-2026-11-16.md):
implantado com novos fluxos familiares desligados; isso não libera menores.

No núcleo F3, `autoridade-de-jogo` prepara a identidade antes das travas de
domínio e relê perfil/aparelho, responsabilidade/geração, login, política e
prazo. Dados/conquistas usam esse kernel com o mutex antes do aparelho e uma
conferência final após esperas de chave/auditoria. Emissão carrega o emissor
Ed25519 local antes da transação; somente criptografia local entra sob as
travas. Versão e prazo assinados vêm dos fatos relidos nessa transação, nunca
de uma avaliação anterior à espera. Falha reverte consumo, tempo e sessão.
Novos escritores protegidos são desligados por padrão (`RECREIO_FAMILY_MODE`);
desligar não elimina a restrição nativa ou a recuperação pelo adulto. Contratos,
gates e partes ainda não integradas em [F3](../../docs/recreio/politicas-sessoes-2026-11-17.md).

Ficha pública candidata em `/jogos/[jogo]`: editorial/estado/classificação vêm
do catálogo central. Não carregar jogo, autenticação, arte licenciada ou banco
para renderizá-la. Títulos sintéticos não têm ficha pública. Ler o catálogo
não concede sessão nem ingresso; a entrada continua na estante e no kernel.
[Contrato e provas candidatas](../../docs/recreio/ficha-publica-jogos-2026-11-20.md).

Carga do protocolo em implementação: título `carga-teste` interno com oito
membros, sem alterar o contador comum de quatro. `e2e:capacity` recusa execução
fora do GitHub, usa banco descartável e não recebe segredos externos. IPC do
servidor de prova mede somente CPU/RSS/contagens. Não incluir esse título no
catálogo público ou tratar o ensaio como capacidade/custo de produção.
[Plano e limites](../../docs/recreio/capacidade-protocolo-2026-11-20.md).

- `src/app`: rotas e composição. Páginas não importam o banco.
- `src/features/<área>`: `components/` (telas), `actions.ts` (server actions), `service.ts` (sem Next), `repository.ts` (banco). Lógica pura fica em arquivo próprio, com teste (`estante/catalogo.ts`, `perfis/regras.ts`, `acesso/cobertura.ts`, `acesso/texto.ts`). O que precisa do Next sem ser ação fica em arquivo próprio da área (`sessao/ator.ts`, `sessao/http.ts`).
- `src/components`: peças visuais sem dados (marca, capa, formulário de entrada, moldura das páginas de texto).
- `src/lib`: o que atravessa o app (auth, env, chaves dos tokens, respostas HTTP, e-mail, Redis, limite de tentativas, logger, observabilidade). `lib/repository.ts` é o apoio dos repositórios (transação, travas, relógio do banco) e só eles o importam.
- O Biome da raiz verifica as fronteiras: páginas, componentes, ações e rotas não importam `@informach/db`.

## A base (lote P1)

O salvamento final foi implantado em `3f2b1239`, com 0177/0178 e 179 recibos:
[contrato e evidências](../../docs/recreio/salvamento-restrito-2026-11-17.md).
O SDK negocia uma capacidade exclusiva de persistência; mundos usam preparação
e conclusão pela instância com posse atual, foto posterior e SHA conferido.
Sete gates e CI compartilhado passaram; famílias/checkpoint continuam desligados.
O minuto real foi homologado com título interno no GitHub; isso não libera venda.
O agregado separa a margem do orçamento de gameplay, e a supervisão mostra
somente datas/durações recentes ao responsável atual. Recibos técnicos têm
expurgo próprio de 24 horas em lotes, sem encerrar ou reativar sessões.

- Conta Informach por `@informach/auth`: senha ou código por e-mail (OTP para confirmar, entrar e redefinir senha), sem organizations. Sessões no Redis (`recreio:auth:`) com o cache de cookie desligado, para que sair ou revogar valha na hora.
- `/` é a página pública do alfa. `/estante` exige conta confirmada e perfil escolhido; `/conta` exige a conta nativa em contexto adulto e funciona sem jogador. Layout e cada página revalidam a autoridade de seu escopo. `/entrar`, `/termos` e `/privacidade` completam a superfície pública; textos comerciais finais dependem dos recursos realmente liberados.
- `src/proxy.ts` só entrega a CSP com nonce e o caminho de volta do login. A autenticação fica no servidor, em layouts, páginas e ações. A política é montada em `lib/csp.ts`.
- `/api/health` não toca o banco. `/api/ready` exige `transaction_timeout` (PostgreSQL 17+), sonda o schema `recreio`, confere a migração esperada (`checkSchemaReadiness`) e o Redis; dependência incompatível ou Redis ausente responde 503. Os gates completos usam PG 18; o CI geral também prova a recusa em PG 16.
- `/api/email/unsubscribe`: todo e-mail enviado leva esse endereço.
- `RECREIO_ACCESS_MODE` (`fechado` por padrão, ou `aberto`): muda textos e, com `fechado`, faz a estante parar na explicação para quem não tem o direito de jogar. Não é ele que decide quem joga; isso é de `avaliarAcesso`.
- Fora dos buscadores: `INDEXAVEL = false` em `src/lib/seo.ts`, separado do modo de acesso.

## Conta, perfil e sessão de aparelho (lote P2)

São cinco coisas separadas: a conta (`core.users`, do login compartilhado), a assinatura (espelhada pelo `@informach/billing`), o grupo de assinatura, o perfil e a sessão de aparelho. **O jogo só recebe o id do perfil, nunca o da conta.**

- `features/sessao`: `atorAtual()` (em `ator.ts`, com `cache` do React) devolve `{ contaId, sessaoDeAparelhoId, perfil | null }` com os ids de marca de `@informach/recreio`. A sessão de aparelho é uma linha em `recreio.device_sessions`, criada no primeiro pedido de cada sessão do Better Auth. O perfil ativo mora nessa linha e é conferido a cada pedido contra a lista que o servidor monta para a conta (`perfisSelecionaveis`); se saiu da lista, a sessão fica sem perfil. **Nenhum cookie e nenhum campo do pedido leva id de perfil.** `perfilAtivo()` lança `NAO_AUTENTICADO` ou `SEM_PERFIL`; `paginaDaConta()` e `paginaDoPortal()` são as versões que redirecionam.
- `features/perfis` cria/edita o jogador adulto próprio, opcional para o pagante. A escolha familiar em `/perfis` usa o domínio de proteção/PIN para distinguir adulto, menor e retorno à gestão. O seletor legado `selecionarPerfil` continua exclusivo do adulto próprio; não o ampliar para contornar o PIN de menores. O apelido segue `APELIDO` e os avatares são o conjunto fixo `avatares.ts`.
- `/conta/perfil` edita só apelido/avatar do adulto próprio. A entrada não leva identificadores; o repository trava perfil → aparelho e revalida conta, seleção, revogação, prazo e estado ativo. Base divergente recusa sobrescrita de outra aba; repetição igual não gera evento. `recreio.profile_updated` guarda apenas os nomes dos campos, atomicamente com a atualização; política e cobertura não mudam.
- `features/aparelhos` lista por conta e por páginas de vinte sessões de login; o aparelho atual fica separado. A desconexão de outro aparelho serializa por conta antes de revalidar perfil adulto/aparelho; depois trava alvo → cursor → sessões de jogo. Dados e auditoria são atômicos; mantém a negativa persistida, sem excluir o login nem afetar outros apps. Aparelhos pareados e gestão infantil pertencem a A5.
- O layout `/(portal)` exige conta nativa, inclusive sem jogador. Páginas de jogo/estante usam `paginaDoPortal`; páginas de gestão usam `paginaDaConta` e sua autorização própria. Não obrigar criar jogador para administrar família, assinatura ou dados.
- Sair é `POST /api/conta/sair`: encerra a linha da sessão de aparelho (`revoked_at`) e a sessão de login no mesmo pedido. Linha encerrada não volta; com o login ainda de pé, o portal manda entrar de novo.
- Ids de conta, perfil e sessão são todos UUID. O que separa um do outro é a marca do tipo na compilação e, em execução, a consulta (cada id só é procurado na sua tabela, sempre junto com a conta de quem pede). Toda fronteira valida com o esquema Zod do domínio, sem cast.

## Direito de jogar (lote P3)

- `features/acesso/service.ts`: `avaliarAcesso({ profileId, gameId? })` carrega os fatos (perfil, grupo, assinatura do titular pelo `getProSubscription`, concessões) e entrega a `decidirAcesso`. **É o único lugar do app que lê assinatura ou concessão para decidir acesso**; `features/acesso/fronteira.test.ts` falha se outro arquivo de `src` fizer isso. Telas, ingresso e renovação de sessão chamam `avaliarAcesso`.
- `features/acesso/decisao.ts` compõe a mesma decisão a partir dos fatos; o repository aceita a conexão da transação. A troca de ingresso toma SHARE no perfil antes de reler a autorização na própria transação. A revogação toma UPDATE nos perfis do grupo, ordenados, e encerra somente as sessões que perderam cobertura pelo cursor transacional. A instância as recebe no próximo batimento (10 s quando o transporte está saudável); não depende da renovação do navegador.
- Cobertura: o perfil precisa ter grupo, estar com `coverage_enabled` e caber, por ordem de criação, no limite de perfis do plano em vigor (`acesso/cobertura.ts`).
- F6 tem candidatas de consentimento, teste pela primeira sessão, Checkout recuperável, conciliação financeira completa, webhook e job autenticado. Catálogo/preços/portal foram conferidos no Stripe de teste; o Checkout hospedado parou no hCaptcha e ainda exige homologação humana. Agendas, recibos e revisão comercial das trocas estão em qualificação. Cobrança e teste continuam desligados em produção; faltam trocas completas, agendamento operacional, endpoint público e homologação comercial. [Estado comercial](../../docs/recreio/comercial-levantamento-2026-11-18.md) e [trocas](../../docs/recreio/trocas-plano-2026-11-18.md).
- Na candidata de admissão financeira, status ativo exige origem comercial admitida, fatura paga compatível e conferência bem-sucedida dos últimos quinze minutos. O prazo de ingresso/sessão é limitado por esses fatos. Falha, estorno, contestação ou prova ausente recusam acesso pago; concessões explícitas conservam seu contrato separado. O repository de acesso carrega estes fatos e a decisão pura compõe o limite.
- Na candidata de financiamento, saldo do customer é composto entre seus contratos nativos. O escritor conserva datas/flags core e guarda prova, captura e fontes separadas; o acesso pago exige prova `verified` da política atual com relógio igual ao período core. Creditar um sufixo limita a prova original; estorno da origem afeta dependentes sem falsificar flags de suas faturas. Ausência de prova recusa acesso pago. Componentes e integração têm gates distintos; [estado e limites](../../docs/recreio/financiamento-creditos-2026-11-18.md). Não implantar migrations ou ativar cobrança com base na prova de API.
- Em produção, o alfa joga por concessão auditada: `pnpm --filter @informach/recreio-app conceder --email <e> --tier individual|family --dias <n> --motivo <codigo>` e `revogar --email <e> --motivo <codigo>` (`scripts/`, rodam com `tsx`). Exigem `DATABASE_URL`; a avaliação de assinatura paga também exige `STRIPE_MODE` igual ao serviço atendido (padrão `dev`). A linha em `recreio.entitlements` e o evento de auditoria entram na mesma transação. Uma concessão vigente por grupo; o motivo é um código curto, nunca texto livre.
- Auditoria: `recreio.profile_created`, `recreio.entitlement_granted` e `recreio.entitlement_revoked`, com os campos de `docs/audit-payload-policy.md`. Nunca apelido, e-mail, IP ou token.
- A criação de perfil/grupo e seu evento são atômicos no repository. Os scripts operacionais usam `node --conditions=react-server --import tsx` pelos comandos do package para consumir os mesmos repositories protegidos por `server-only`; não precisam das variáveis de ambiente do Next.
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
- `avaliarAcesso` usa o pool para a leitura preliminar; não chamá-lo de dentro de uma transação. A admissão final da sessão relê os fatos com `lerFatosDeAcesso(perfilId, tx)` e usa `decidirFatosLidos`, exclusivamente na conexão da transação. Isso impede que uma revogação entre a conferência preliminar e a inserção reabra o acesso.

## Mundos, membros e convites (lote P5)

F5 está em qualificação, ainda sem implantação. O responsável nativo atual pode
gerir o mundo de um menor sem jogador próprio; a credencial infantil conserva
somente gameplay. A estante protegida candidata cria mundos pelo mesmo serviço
autoritativo e volta a `/aparelho`. `/participantes/[id]` e o painel do host
oferecem proteção sem amizade: o servidor prova coparticipação sob a ordem
contas → mundo → perfis. A consulta nativa e a proteção não exigem cobertura.
Denúncia captura referência opaca, nunca evidência enviada pelo navegador.
Bloquear não remove membros; códigos adultos também revalidam bloqueios no
aceite. Convites dirigidos, aprovações e visitas seguem pendentes no
[registro de F5](../../docs/recreio/mundos-completos-2026-11-17.md).

- `features/mundos`: `service.ts` é chamado pelas rotas do SDK (sessão de jogo) e pelas ações do portal (cookie). Quem chama entrega o perfil já conferido; nenhum id de perfil vem do pedido.
- Rotas: `GET` e `POST /api/sdk/v1/mundos`, `POST /api/sdk/v1/mundos/{id}/convites`, `POST /api/sdk/v1/convites/aceitar` (token da sessão de jogo ou cookie do portal). Telas: a estante lista os mundos do Morada, com "Criar mundo" e "Entrar com código"; `/mundos/[id]` mostra quem participa e, para o responsável, gera o código; `/convite?codigo=` traz o código preenchido e espera a pessoa confirmar.
- Criar: teto `limites.mundosCriadosPorPerfil` do manifesto, por jogo, contado sob uma trava por perfil (`LIMITE_DE_MUNDOS`). O mundo nasce `hibernating`, com a política de mundo pedida se o jogo a oferece, senão a padrão.
- Emitir convites: contador próprio por perfil (20/10 minutos) e teto de convites vigentes por mundo igual ao máximo de membros do catálogo, sob `FOR UPDATE` do mundo. Aceitos/vencidos deixam de ocupar o teto; gerar outro código não invalida os anteriores. Recusa `LIMITE_DE_CONVITES`. O batimento renova as posses em lote, sem uma consulta por mundo; ids repetidos e mais de 1.000 mundos são recusados antes da atualização.
- Convidar: **só o responsável, só `member`** nesta etapa (`visit` dá `SEM_PERMISSAO`). O código vale 24 h e uma vez; o banco guarda só um HMAC dele (`mundos/codigo.ts`). Quem não é membro ativo, mundo de outro jogo e mundo que não existe dão a mesma recusa (`NAO_MEMBRO`).
- Aceitar: a linha do mundo é travada antes da do convite. Código errado, vencido, usado ou revogado: `CONVITE_INVALIDO`, sempre igual. Depois `JA_MEMBRO` e `MUNDO_CHEIO` (`capacidades.mundos.membrosMax`), que não gastam o convite. Quem já saiu do mundo (`former`) volta na mesma linha de membro. As tentativas são contadas por perfil, dez a cada dez minutos (`lib/rate-limit.ts`, o contador de `@informach/auth`: Redis quando existe, senão `core.rate_limit`).
- Auditoria na mesma transação da mudança. **Evento de mundo não leva `targetId`**: liga-se a uma pessoa só pelo ator.

## Posse e API das instâncias (lote P6)

A saída voluntária de convidado fica em `features/mundos/saida.ts` e `saida-repository.ts`: somente o próprio adulto, com perfil/aparelho revalidados na transação, independentemente da cobertura comercial. O mundo é travado como na admissão; membro vira `former` e sessões vinculadas acabam atomicamente com auditoria estrita. O responsável só pode sair depois da transferência aceita, já implantada. [Contrato e limites do incremento](../../docs/recreio/saida-de-mundo-2026-11-16.md); a gestão de participações não ativas e o restante de A6 continuam pendentes.

O contrato é o `ClienteDoHost` do package, e a implementação é conferida pela suíte de conformidade (`test/conformidade.integration.ts`). Se o comportamento daqui e o da plataforma em memória divergirem, a suíte é quem manda.

- Rotas em `src/app/api/interno/v1`, só para servidores de jogo: `Authorization: Bearer <segredo do jogo>` comparado em tempo constante, jogo em `X-Recreio-Jogo`, instância em `X-Recreio-Instancia` (`features/posse/http.ts`). Sem cookie e sem conferência de origem. O segredo de um jogo só alcança instâncias e mundos daquele jogo: mundo de outro jogo responde `NAO_ENCONTRADO`, instância de outro jogo `NAO_AUTENTICADO`.
- **A regra central** (`features/posse/repository.ts`): toda operação de uma instância sobre um mundo trava a linha do mundo (`FOR UPDATE`) e exige, na mesma transação, a posse aberta com aquela cerca, daquela instância, reivindicada e dentro do prazo. Fora disso é `POSSE_PERDIDA` e nada muda. O prazo é julgado com `clock_timestamp()`: `now()` é a hora do começo da transação, e quem esperou a trava seria julgado com hora velha.
- Ordem das travas no app: linha da conta em `core.users` (quando entra), linha do mundo em `spaces`, depois o resto.
- `POST /api/sdk/v1/mundos/{id}/abrir` (navegador): com o mundo travado, entra na posse vigente ou fecha a vencida (`expired`), sobe `lease_epoch` e atribui a posse à instância ativa, vista dentro do prazo, com vaga e com menos mundos. Sem nenhuma: `SEM_INSTANCIA`, e nada fica pela metade. A resposta não leva a cerca. A retomada nunca espera a manutenção.
- O batimento renova cada posse com um comando condicionado à mesma linha que a retomada fecha: renovar e retomar nunca acontecem as duas. Pode não acontecer nenhuma (a abertura encontra a posse no prazo e o batimento chega depois do vencimento): a dona já se cercou e a próxima abertura retoma, ao custo de uma reconexão. Também soma jogadores por segundo e o pico, e devolve as sessões de jogo encerradas depois do cursor. Sem cursor valem as encerradas desde o registro da instância.
- Uma instância só se registra com o endereço de `RECREIO_GAME_ORIGINS[jogo].ws`.
- Diário: contínuo a partir de `journal_seq + 1`, tudo ou nada; repetir exatamente uma entrada gravada (ou já compactada) não faz nada. Fotografia: só sobre a `revisaoEsperada`; o `sha256` é calculado aqui; ficam as 5 mais novas e as fixadas, e o diário é compactado até a mais antiga guardada. Os tetos vêm de `limites` do manifesto.
- `features/posse/armazenamento.ts` é a porta das fotografias e do diário; `armazenamento-repository.ts` conserva metadados/recibos no Postgres e devolve fonte pg limitada ou referência de bucket confirmada. O serviço materializa fora da transação e relê posse/fonte antes de entregar. Executor de entrega e leitores estão em candidata qualificada, com migração de produção desligada; não tratar pg_dump de ponteiros como backup completo.
- `POST /api/jobs/manutencao` (`CRON_SECRET`, registrado em `ops.job_runs`): posses vencidas, instâncias caladas há mais de dois prazos (`gone`; se voltarem a bater, ficam `active` de novo), ingressos vencidos há mais de um dia, sessões de jogo sem renovação e, por último, convites sem aceite vencidos há mais de um dia. Ingressos e convites: até 500 de cada por passagem, consulta em até 5 s e linhas disputadas ficam para a próxima. Convites aceitos conservam sua evidência; não se apagam membros, mundos ou auditoria. O escritor de convites exige antes o índice 0164 válido/pronto. Repetir continua lotes sem duplicar efeitos; só contagens, falha parcial responde 503. [Retenção técnica](../../docs/recreio/retencao-tecnica-2026-11-16.md) e [convites](../../docs/recreio/convites-retencao-2026-11-16.md).
- Auditoria: `recreio.space_lease_taken_over` na transação da retomada; `recreio.space_write_refused` quando uma instância autenticada escreve sem a posse.

## Página do jogo (lote P7)

- `/jogar/[jogo]?mundo=<id>` (`src/app/jogar/[jogo]/page.tsx`) fica fora de `(portal)`: o jogo ocupa a janela inteira, sem o cabeçalho do portal. Recebe o jogador do aparelho nativo ou pareado (`paginaDoJogador`); a prévia relê a autoridade atual antes de entregar o cliente, sem conceder gestão da conta. `features/jogar/service.ts` decide no servidor, nesta ordem: jogo que não existe neste deploy, não abre ou não tem cliente no portal é 404; perfil sem o direito de jogar volta para a estante, que já explica; sem `?mundo=` volta para a estante; mundo que não existe, é de outro jogo ou do qual o perfil não participa mostra o mesmo aviso ("Este mundo não está disponível").
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

## Presença do anfitrião, candidata F5

Somente o contador interno declara visitas. A página negocia o bit quando
manifesto e `RECREIO_VISITS_MODE` permitem; o cliente o repassa pela sessão e
o servidor relê os fatos persistidos. `e2e/servidor/presencas.ts` liga o
produtor do package à conexão física, conserva respostas incertas e agrupa
renovações após a posse, sem bloquear seus batimentos. Saída ou desconexão
encerra o produtor mesmo durante o salvamento. A jornada lê agregados do banco
descartável para verificar entrada, renovação e saída reais. Runtime/UI de
visitante e implantação F5 continuam pendentes no
[registro de visitas](../../docs/recreio/visitas-temporarias-2026-11-17.md).

O runtime candidato do contador também separa visitante de membro e só entra
em mundo já carregado com o anfitrião original conectado. Guarda monotônica
corta comandos na chegada/fila; renovação incerta pausa e retomada exige
admissão privada nova. Recibos negativos continuam fora da vida do socket,
com reserva limitada e recuperação por lote. Checkpoint/finalização não dão
autoridade de gameplay. A UI/preflight e a jornada física completa do visitante
ainda precisam ser integradas/qualificadas; o Morada não declara essa capacidade.

A candidata seguinte trata `?visita=` como finalidade fixa e usa a mesma
conferência da concessão atual na prévia nativa, sem abrir SID/vínculo ou
alocar mundo. Somente após essa composição entrega o nome do mundo e o UUID
da concessão ao hospedeiro. Não há fallback silencioso para membro quando
o título/modo não aceita visitas. Caixa, decisões e jornada completa seguem
em implementação no registro.

## Morada na página do jogo (lote X1)

### Troca de aparelho em homologação (17/11)

O modo `RECREIO_CHECKPOINT_MODE=on` usa intenção vinculada a ingresso/aparelho/SID
e espera o ACK de dados de perfil ou da instância antes da nova sessão.
`JogoMontado.checkpoint({id, modo})`
é opcional e aguardável; ausência ou falso nunca confirma. `retomar` só vale quando
o controle servidor confirmou ausência de barreira. A consulta continua durante
a pausa, sem renovação; nunca desmontar a partida pausada como se a troca já
estivesse concluída. ACK perdido é resolvido pelo estado atual. SDK não envia
conta, nascimento, agenda ou progresso no controle. O booleano do cliente de
mundo não basta: o host relê o controle após a confirmação da instância.
O Morada ainda não declara esse adapter; permanece com saída manual confirmada.
Detalhes e limites no
[registro de checkpoint](../../docs/recreio/checkpoint-sessoes-2026-11-17.md).

Na fonte implantada `2475661`, `off` e títulos sem contrato autenticado de mundo exigem
salvar/sair no aparelho anterior; `continuarAqui` não os desconecta à força.
Sem acesso ao aparelho antigo, a gestão permite revogá-lo explicitamente, ou
aguardar a concessão vencer. Não simular ACK nem reduzir o prazo em teste para
anunciar uma recuperação real. Famílias, troca automática e venda continuam
desligadas em produção; verificar gates e configuração antes de ativar.

Na fonte implantada, um SID de jogo fica vinculado ao primeiro mundo admitido pelo host.
Entrar em outro mundo exige encerrar a partida e emitir outra, com nova autoridade.
Não reatribuir `game_sessions.space_id` de uma sessão aberta: isso permitiria
conexões simultâneas fora da prova de checkpoint. A exclusão física futura de
mundos deve encerrar suas sessões antes de remover o vínculo.

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

Cadastro declarado de menores, PIN, pareamento e supervisão têm código,
com novos fluxos familiares desligados em produção. Faltam checkpoint entre
aparelhos e avisos de tempo, social/moderação, cobrança Stripe, webhooks e
telas operacionais próprias no Bastidores. Os
eventos do Recreio já têm classificadores/frases no console; isso não dá acesso
ao conteúdo dos mundos. Nos mundos, continuam pendentes visita, convite por
membro com aprovação, coadministradores, arquivamento e
exportação/exclusão. Bucket e backup agendado continuam pendentes. A exclusão
automática da conta permanece desligada; a transferência aceita sozinha não
conclui o encerramento de conta e de todos os vínculos compartilhados.

Perfil adulto próprio e sua edição, gestão de aparelhos, participações e saída
voluntária já têm código e provas. O alfa tem serviços, manutenção e sondagem
externa implantados. O portal implantado oferece proposta/aceite/
recusa/cancelamento por duas contas adultas, com login recente, papéis e fim de
partidas atômicos. O autor da auditoria é quem aceitou; a conta afetada de cada
partida fica em `targetId`. Remoção pelo responsável também está implantada,
com lista paginada, login recente e auditoria atômica. O aceite de convite relê
o emissor, e convites anteriores à saída/remoção não readmitem o perfil. A
transferência revoga os códigos pendentes do antigo responsável. Conferir
a ativação e os limites atuais em
[PRODUCAO.md](PRODUCAO.md) e no [registro da frente](../../docs/recreio/implementacao.md).

Não adiante nada disso fora do lote correspondente do registro da frente.

## Visual

Tom editorial escuro da proposta, com a capa do jogo fazendo o trabalho visual. Tokens `--rc-*` em `src/app/globals.css`; `src/app/tema.test.ts` mede o contraste. Fontes Bricolage Grotesque (títulos) e Plus Jakarta Sans (texto), servidas pela própria origem. Nenhuma arte licenciada entra no repositório: a capa do Morada é um SVG provisório em `src/components/desenhos.tsx`.

Textos em português do Brasil, simples e diretos, sem prometer o que ainda não existe.

Controles que dependem de JavaScript usam `useHydrated` de
`@informach/ui/hooks/use-hydrated` para aguardar a interatividade, junto do estado
pendente da operação. Isso inclui entradas controladas, escolha de perfil,
convites, gestão de aparelho, saída, remoção e transferência. Os E2E suspendem
scripts pelo interceptador único da fixture, preservam o IP sintético e conferem
habilitação após liberar os pedidos; não trocar essa prova por espera fixa.

## Revisão de 13/11/2026

- A emissão de ingresso limita cada perfil a 20 pedidos por minuto, pelo mesmo armazenamento de limites do app.
- A renovação confere se o jogo continua aberto; manutenção encerra a sessão com `access_lost`, entrega `JOGO_INDISPONIVEL` e aparece no cursor de encerramentos da instância.
- A entrada autorizada pela instância reavalia o direito de jogar, depois de conferir escopo, sessão e perfil, preservando as recusas que não revelam a existência de outro perfil/mundo.
- A guarda compartilhada de `@informach/auth` impede excluir, por outro produto, uma conta que tenha perfil no Recreio. Enquanto arquivamento, exportação/exclusão e todos os vínculos não forem resolvidos, a exclusão é assistida pelo suporte; o Recreio continua com a exclusão automática desligada.
- O E2E isolado serve o Next standalone com `public` e `static` copiados e sobe `dist/main.mjs` do Morada. O estado inicial sem publicação foi superado em 15/11: alfa fechado implantado, com limites e pendências em [PRODUCAO.md](PRODUCAO.md).


## Arte da casa e verificação privada (D1)

O portal continua só declarando `RECREIO_GAME_ORIGINS.morada.assets`; o jogo baixa a arte autenticada diretamente do servidor dele. Quando há origem de arte válida, `connect-src` também aceita `blob:`: o `GLTFLoader/ImageBitmapLoader` faz `fetch` das texturas embutidas. Outras páginas e jogos sem origem de arte continuam com a política anterior.

O runner isolado aceita `RECREIO_E2E_ARTE_DIR=<pasta externa com manifest.json>`. Ele declara a origem HTTP da arte, entrega a pasta ao servidor do Morada e cria a pasta de evidências fora do checkout. Capturas manuais, screenshots automáticos e traces seguem para lá; o CI padrão continua sem arte. A rede fictícia de cada conta de teste (`x-real-ip`) só é aplicada à origem do portal, nunca à origem da arte. A jornada com arte confere os modelos e acabamentos carregados, as portas/janelas e a CSP, além de repetir as quedas.


Importação offline de fontes históricas: `scripts/backup/importar-fontes-direitos`
recebe apenas o cliente do cluster privado já restaurado/conferido/normalizado;
recusa o banco comum antes de qualquer leitura externa. Prefixo/plano inteiros e
cerca congelada são conferidos antes da primeira escrita. Repetição compara,
nunca sobrescreve plano, mapa, captura ou datas. É preparação de proveniência,
sem criar operação, conta, consentimento ou permissão de efeitos/tráfego.
Gates deste incremento ainda pendentes; [sequência](../../docs/recreio/reaplicacao-nativa-2026-11-20.md).


A trava `account/serializacao-repository` é uma primitiva SQL, sem identidade ou
login, reexportada pela porta anterior. Jobs de direitos usam o mesmo writer
estrito por `@informach/auth/audit`, com transação explícita. Isso separa a carga
do job das credenciais do portal; não concede permissão histórica ou exceção à
cerca. Cinco workers SQL estão em qualificação sem credenciais de app no cluster
frio, exigindo a recusa normal do livro congelado.


Na candidata de recuperação, `direitos/coordenacao-repository` conserva uma
coordenação privada temporária vinculada à conexão real, execução, captura e
cerca congelada, depois do preflight inteiro. Copiar o objeto ou usá-lo depois
do callback não conserva a capacidade. Workers SQL escolhem banco/escopo pela
coordenação, nunca por flag ou variável de banco alterada. O contexto privado
atual exclui encerramento financeiro e não cria operações nem libera tráfego;
admissão e efeitos históricos continuam em implementação.
