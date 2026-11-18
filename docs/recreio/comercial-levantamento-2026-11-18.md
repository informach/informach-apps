# Recreio — levantamento para a homologação comercial

F6 do [fechamento da plataforma](fechamento-plataforma-2026-11-16.md), autorizada
pelo titular. Este registro organiza fatos e pendências; não habilita cobrança,
ensaio pago ou venda. F5 foi implantado com recursos desligados em `d014bd90`,
204 recibos/0203 e evidências próprias, integrado publicamente em `337dc630`.

## Incremento de teste gratuito, em qualificação

`2a8fa076` passou nos nove gates `44285538484`, incluindo consentimento nativo
e retirada, modos reais `off`/`setup`, integridade SQL e regressões. A interface
`0523217f`, `44289414523`, acrescenta página própria sem exigir jogador; seu
gate `trial-ui` passou com duas contas, recarga, retirada e ausência de perfil,
concessão, SID ou claim. Outros gates dessa fonte ainda em andamento.

A candidata seguinte acrescenta ingresso elegível distinto de gameplay e
início da concessão apenas na abertura transacional da primeira SID. O ciclo
financeiro precede contas → grupo → perfil → aparelho; não se autentica o
pagante por representação. O savepoint reverte a concessão também nas recusas
retornadas pelo kernel. Recibo/auditoria só são inseridos depois da SID real.
Gate próprio `trial-experiment` cobre o modo real, sem ligar teste nos testes
antigos de falta de acesso. As novas provas ainda precisam ser executadas.
F6 não foi implantado; não houve teste gratuito ou cobrança em produção.

## Contratos confirmados

- Individual: R$ 59,90/mês ou R$ 599/ano, um perfil coberto.
- Família: R$ 127,90/mês ou R$ 1.279/ano, até quatro perfis cobertos.
- Pagante não precisa ocupar perfil de jogador. Adulto convidado usa login próprio.
- Responsabilidade pelo menor é declarada; não gravar verificação externa fictícia.
- Cobrança de Recreio continua isolada de Compasso e Suíte Edi.
- Testes pesados, builds, E2E e cargas somente no GitHub Actions.

Na proposta privada `artes-3d/paginas/recreio.html` v2.2, linhas 583–604, o teste
sem cartão compara 48 horas com sete dias, começa na primeira sessão autorizada
e cobre até quatro perfis. É concessão promocional persistida pelo servidor,
não assinatura Stripe. Cadastro, emissão de ingresso e clique em Jogar não
comprovam sessão autorizada. A análise de ativação específica do Morada continua
separada da entrega técnica da plataforma; jogo interno não prova diversão pública.

## Código já disponível

`packages/config/src/products.ts` contém os quatro produtos e valores aprovados.
Os IDs Stripe de dev/prod ainda são placeholders. A composição precisa usar
`getConfiguredProducts` e as variáveis registradas no catálogo, sem mapa de preços
paralelo ou inferência pelo valor cobrado. Não provisionado por este levantamento.

A inspeção seguinte encontrou ausente o campo `stripePriceEnvironmentVariable`
nos quatro produtos. A candidata registra `RECREIO_INDIVIDUAL_MONTHLY_PRICE`,
`RECREIO_INDIVIDUAL_ANNUAL_PRICE`, `RECREIO_FAMILY_MONTHLY_PRICE` e
`RECREIO_FAMILY_ANNUAL_PRICE` no próprio catálogo. A resolução existente muda
somente o modo pedido, preservando valores/intervalos e IDs do outro modo.
Não altera preços no Stripe, não cria variáveis no Railway e não habilita venda.

`apps/recreio/src/features/acesso/repository.ts` lê assinaturas do pagante do
grupo com `provider=stripe`, `app=recreio`, `subjectType=user`. A mesma leitura
atende pagante sem perfil. Cortesias e testes são concessões distintas.

O motor existente em `packages/billing/src/checkout-lifecycle.ts` conserva
intenção de Checkout, tentativa admitida, expiração fixa e recuperação do
resultado remoto; `managedCheckout` já é usado pela Suíte Edi. A composição do
Recreio precisa preservar esse protocolo e seu isolamento, sem copiar o emissor
Edi ou os contratos Compasso. Inspeção não comprova homologação do Recreio.

Versão instalada no package: Stripe Node 22.1.0; adapter fixado na API
`2026-04-22.dahlia`. Não atualizar dependências por uma recomendação genérica.

## Achado que deve ser resolvido antes da cobrança

### Primeiro incremento em qualificação: prazo finito

A candidata passa a carregar começo/fim do período e fim do teste ao domínio.
Status ativo só concede capacidade no período vigente, com fim exclusivo;
cancelamento e teste reduzem esse prazo. `trialing` sem fim do teste não
concede acesso. Cortesia vigente continua sendo uma origem separada.

Ingresso também recebe o limite relido sob trava (acesso/aparelho), sem alterar
o teto de sessenta segundos. SID e renovação já usam o limite da mesma decisão
do kernel; o incremento acrescenta provas de prazo e de renovação recusada
quando o período persistido vence. Nenhum teste pesado foi executado localmente.
Qualidade e testes serão executados no GitHub antes de integrar esta mudança.

Isso fecha somente a lacuna temporal quando qualificado: o status espelhado
ainda não substitui prova financeira, tratamento de estorno/contestação,
conciliação e homologação real do Recreio com Stripe. Cobrança permanece
desligada; nenhum preço, customer, assinatura ou charge foi criado.

### Diagnóstico de origem

O carregador do Recreio conserva status/produto/cancelamento, mas ainda não
leva o começo/fim do período financeiro ao contrato de domínio. A decisão em
`packages/recreio/src/dominio/acesso.ts` aceita status ativo e usa somente a
data de cancelamento como limite. Também precisa recusar uma data de
cancelamento já vencida mesmo se o evento seguinte atrasar.

Antes de habilitar cobrança, a admissão precisa de período finito vigente e
prova financeira apropriada; evento perdido, status antigo ou sincronização em
conferência não podem produzir acesso ilimitado. Clampar ingresso/SID/renovação
e capacidade de cobertura ao mesmo fato relido na transação. `getProSubscription`
continua a fonte comum da elegibilidade por status; não alterar a política dos
outros aplicativos para corrigir o adapter comercial do Recreio.

## Provas ainda exigidas

### Sequência em execução

A primeira geração do recibo foi **recusada na revisão**, sem copiar o SQL:
run `44280151006`, fonte `8af2f6d2ed113610bef62d5c1a12bed1b6f9e647`, artefato
`14415029543`, ZIP 64600 bytes/SHA-256
`39ae5a45aec88606bf132d623e9a0181206fdd4f4f265f8202cf0710a3ba397d`.
`0204_whole_kitty_pryde.sql` (2210 bytes,
`c7c579fa88d7d0ca73b0d481c6362add8624a9a94c582243a7c58e60df271b08`)
criava a FK composta antes da UNIQUE nova em `entitlements`. PostgreSQL exige
a chave referenciada antes da FK. A correção gera primeiro somente a identidade
única e depois, sobre esse snapshot, a tabela do recibo. Não editar SQL gerado
para inverter instruções; nenhum desses artefatos foi aplicado em produção.

A geração somente da identidade foi revisada em `44280590355`, fonte
`4ad92e70`, artefato `14416199335`: ZIP 63719 bytes/SHA-256
`5b5dd412050451d5bfae8b0e698b9b3c6699a3ec9b3ec1258bfdcb86941a0810`.
Copiados intactos após conferir origem, cada tamanho/hash, predecessor do
snapshot e prefixo inteiro do journal:

- `0204_nappy_jasper_sitwell.sql`: 149 bytes,
  `ce61b915b186970f3772197e2890a3ce9b30f2951dda51bd7b3b772e9e845643`.
- `0204_snapshot.json`: 931446 bytes,
  `4d37e66a39460a914f02e737a6147d738b2f0f7e23299c03b8a5be9c1dcaad6b`.
- `_journal.json`: 30966 bytes,
  `54ef96a569a9437fe6bc025ca600353ac9566532174ab09a957b58a8282a1eaf`.

0204 acrescenta somente a UNIQUE, sem DML/backfill. A tabela do recibo agora
volta ao schema para gerar 0205 sobre esse predecessor. Ainda exige os gates
de upgrade e execução; sem migration ou concessão de teste em produção.

0205 foi gerada com consentimento nativo separado em `44281864958`, fonte
`157a69d6`, artefato `14417042111`: ZIP 65079 bytes/SHA-256
`fea5d28fe2197ab9d9993363062061cd9cc2bc6db6281166b8701cf23fcbad2c`.
A UNIQUE da tabela nova é inline e as FKs vêm depois das duas criações; a
referência da concessão já encontra 0204 aplicada. SQL sem DML, copiado intacto
após verificar todos os tamanhos/hashes, predecessor e prefixo do journal:

- `0205_young_newton_destine.sql`: 3535 bytes,
  `61adc4a9542c525ed67968e8b39c6997bc3ccfc6a14d5092dc4d09789e2f4838`.
- `0205_snapshot.json`: 940188 bytes,
  `20cd0a61e8a2b2650859be59f31840147943ab48f59aba1586a98a3cd20d391c`.
- `_journal.json`: 31116 bytes,
  `f81ea9f4fbf24613bfeb607dc6ec8f38d50a0593f53c5a78c72b1fab19cf71c6`.

O schema candidato passa a 206 recibos. Produção continua em 191/0190, e a
candidata de implantação F5 permanece em 204/0203, sem incluir este schema F6.

Doze casos PostgreSQL novos exercitam consentimento ativo único, escopo de
pagante/grupo/versão, tipo/tier/período exatos da concessão, coorte/duração,
revogação permitida e impedimento de apagar/estender uma concessão já usada.
São fixtures SQL de integridade, ainda em qualificação; não comprovam ação
nativa, consentimento de uma pessoa ou início atômico pela primeira SID.

### Consentimento servidor em preparação para qualificação

`features/teste` prepara/consulta/retira o consentimento do próprio pagante,
sem jogador obrigatório. Preparação exige login recente, contexto nativo
irrestrito, as duas declarações e versões atuais; não aceita identidade no
formulário. Consulta e redução revalidam contexto atual, sem exigir plano.
Pedido repetido devolve o recibo existente, inclusive se já retirado; não
reabre o consentimento. Falha real de auditoria reverte grupo/recibo.

`RECREIO_TRIAL_MODE` fica `off` por padrão; `setup` só admite consentimento,
e `experiment` será usado para a primeira SID. Nenhum destes foi ativado no
Railway. O novo gate `trial-setup` usa banco descartável e o modo real `setup`,
com config própria; a integração comum continua `off`. Todos os oito gates
anteriores permanecem, acrescidos desse nono, sem pular casos.

A retirada revoga somente a concessão de teste ligada ao recibo e conserva a
marca de uso. Reavalia os quatro perfis sob as travas do grupo: sem acesso,
encerra a SID; com fallback de prazo menor que a credencial antiga, também a
encerra para exigir credencial limitada. Plano válido com prazo compatível
continua vigente. Não fabrica salvamento nem apaga progresso ou assinatura.

As provas candidatas incluem duas contas, pagante sem jogador, replay e
concorrência, PIN infantil compartilhado, aparelho pareado real, login antigo/
encerrado, escopo de cliente comercial, rollback de auditoria e retirada com
fallback. Espelho financeiro sintético não comprova pagamento no Stripe;
concessão de fixture não comprova início pela primeira SID. A superfície
nativa/HTTP e a admissão automática do experimento ainda precisam ser concluídas.

`3a2f8196`/`44283018962` executou 1074 integrações aprovadas e uma expectativa
incorreta: no PG 18, `ON DELETE RESTRICT` devolve `23001`, não `23503`. A negativa
ocorreu corretamente e a linha foi preservada. O teste passa a usar o contrato
`RESTRICAO` já existente para PG 18/anteriores; a constraint não foi alterada.
Upgrade dessa rodada foi interrompido pela falha; nova prova remota obrigatória.

1. Prazo finito: candidata `4a46a3dd`, oito gates de Recreio aprovados em
   `44276622593`; o CI compartilhado do catálogo seguinte também cobre os
   testes puros. Não implantada.
2. Preços configuráveis: candidata `f81c2c95`, gates `44278073436` e CI
   `44278072474` em curso. Fonte única no catálogo, sem provisionar cobrança.
3. Teste sem cartão: recibo `recreio.trial_claims`, uma vez por pagante/grupo,
   ligado por FK à concessão exata de teste/família e aos seus instantes. Coorte
   48 h/7 dias e versão persistidas; geração aditiva própria no GitHub. O schema
   inicial não inicia teste nem está publicado. Ingresso provisório deve provar
   elegibilidade sem iniciar concessão ou dar gameplay; somente a transação que
   confirma a primeira SID pode criar a concessão. Falha e recusa revertem tudo.
   Antes disso, `trial_enrollments` conserva o consentimento nativo recente do
   pagante e a versão da declaração adulta, sem jogador fictício e sem iniciar
   prazo. Não confundir aceite do experimento com verificação externa de idade.
   A FK do recibo fixa o consentimento, pagante, grupo e versão exatos; retirar
   consentimento não concede outro teste. Não guardar SID eterna como FK do
   recibo: a retenção técnica das sessões deve continuar funcionando.
4. Admissão de teste: preservar contas → grupo → perfil → aparelho, conferir a
   composição depois de esperar, reutilizar o kernel e a decisão única. Quatro
   perfis concorrentes não podem criar quatro testes. Históricos existentes não
   são reiniciados. Modo desligado por padrão; fixtures separadas com modo real.
   Intenções comerciais e a primeira sessão usam o mesmo mutex de ciclo de
   cobrança por pagante, tomado antes da transação, com rede fora de TX. A
   identidade do pagante é pista até ser relida sob trava. O ingresso elegível
   é uma capacidade distinta de gameplay, sem `podeJogar` fictício. Se a abertura
   começar uma concessão e depois recusar política, tempo, troca ou assinatura,
   a transação reverte a concessão; recibo só é confirmado depois da SID real.
5. Checkout/portal nativos: preparar consentimento e autoridade atual sem exigir
   jogador, usar intenção recuperável do billing e reler autorização antes de
   devolver dados financeiros. Rede fora das transações. Portal não pode trocar
   Família por Individual sem a seleção explícita da cobertura no Recreio.
6. Fatos financeiros: assinatura espelhada e fatura paga são fatos distintos.
   Reutilizar o leitor do provedor e o motor de períodos, admitindo estorno,
   contestação, resultado desconhecido e conciliação com revisão observável.
7. Homologação: servidor/HTTP/E2E e provedor real em sandbox, sem efeitos live,
   depois conferência de catálogo, webhook, segredos, cron e operação. A venda
   permanece bloqueada até F7–F11 e catálogo elegível; fixture não é jogo público.

- Concessão de teste atômica com a primeira sessão autorizada, uma vez por
  pagante/grupo elegível, prazo/coorte persistidos e relógio servidor. Recusas e
  rollback não iniciam teste; histórico/concessões antigos não são reiniciados.
- Catálogo e preços conferidos no provedor no modo correto; conta nativa atual
  e login recente nas decisões comerciais. Papel de jogador ou gestão do mundo
  não autoriza contratar, cancelar ou ver dados fiscais de outro adulto.
- Checkout recuperável sem duplicidade por concorrência, resposta perdida,
  retorno falso do navegador ou expiração. Confirmação vem de fatos do provedor.
- Portal restrito ao customer e produtos Recreio; troca/cancelamento com
  revisão e tratamento explícito da redução de quatro perfis para um.
- Webhook assinado, corpo bruto limitado, modo/conta/app conferidos e eventos
  duplicados/fora de ordem. Renovação, inadimplência, estorno e contestação
  revogam ou limitam autoridade atual sem apagar progresso compartilhado.
- Reconciliação recuperável, falhas observáveis, suporte e separação entre
  cancelamento financeiro, saída de grupo, exclusão no app e encerramento global.
- Homologação real em sandbox, incluindo perda de resposta, dois adultos,
  quatro perfis e tentativas por aparelho infantil. Não confundir assinatura
  sintética ou assinatura local de webhook com comunicação real com o provedor.

Migrations F5 0191–0203 foram aplicadas e conferidas; 0204/0205 comerciais
continuam ausentes de produção. Mudança comercial
adicional exige geração própria no GitHub e seu histórico de upgrade. Antes de
publicar código que acione o migrator, controlar o comando para migração sem
seeds e conferir backup/restauração e consumidores compartilhados.

## Documentação primária consultada

Em 18/11, Context7 retornou a documentação oficial de
[idempotência Stripe](https://docs.stripe.com/api/idempotent_requests),
[erros e recuperação](https://docs.stripe.com/error-low-level) e
[assinatura de webhook no SDK](https://github.com/stripe/stripe-node/blob/master/README.md).
O protocolo deve conservar intenção/payload e tratar resultado desconhecido;
chave nova não é prova de ausência de operação remota. Webhook exige os bytes
originais e a assinatura, antes de interpretar o evento. Esses documentos
orientam a implementação e não substituem as provas acima.
