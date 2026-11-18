# Recreio — levantamento para a homologação comercial

F6 do [fechamento da plataforma](fechamento-plataforma-2026-11-16.md), autorizada
pelo titular. Este registro organiza fatos e pendências; não habilita cobrança,
ensaio pago ou venda. F5 foi implantado com recursos desligados em `d014bd90`,
204 recibos/0203 e evidências próprias, integrado publicamente em `337dc630`.

## Incremento de teste gratuito, em qualificação

### Evidência mais recente e candidata de admissão

`33a64ab5` concluiu os dezesseis gates `44314786583`, incluindo onze cenários
de conciliação completa com PostgreSQL e SDK Stripe por transporte fechado.
Contrato concluído sem fatura paga não concede acesso; falha preserva a data
da última confirmação e os fatos financeiros antigos. Isso ainda não comprova
comunicação com o Sandbox nem implantação de worker/webhook.

A candidata seguinte torna a prova financeira obrigatória na admissão real:
origem admitida para o pagante/grupo/modo, fatura paga compatível e conferência
bem-sucedida nos últimos quinze minutos. Ingresso e renovação ficam limitados
por esse prazo. As regressões incluem ausência de origem/fatura, modo errado,
revisão, estorno, contestação, preço divergente e confirmação vencida. Quatro
jornadas adicionais abrem uma SID paga e verificam seu encerramento após fatos
adversos ou falha de leitura. Fixtures positivas antigas agora declaram os
fatos financeiros sintéticos; não passam a representar pagamentos externos.
Essa alteração ainda aguarda os dezesseis gates remotos.

`6843bc37`/`44319953686` encontrou duas expectativas antigas: prazo contratual
de um dia no fallback, que agora é limitado pela conferência de quinze minutos,
e `ACESSO_PERDIDO` para SID que a conciliação já encerrou (`SESSAO_ENCERRADA`).
As proteções foram mantidas; as expectativas passam a verificar o contrato
vigente. Onze cenários financeiros anteriores e os quatro cortes persistidos
chegaram às respectivas asserções; nova execução integral continua obrigatória.

O incremento seguinte permite um novo aceite explícito substituir uma intenção
com Checkout terminal comprovado, após conferir ausência de assinatura vigente.
Nunca reenvia o POST da intenção antiga nessa troca. Aceite antigo, sessão aberta
ou resultado desconhecido conservam a proteção; há regressões com SDK/PG para
expiração seguida de novo aceite e inspeção indisponível.

A candidata de prazo de leitura acrescenta orçamento de noventa segundos por
pagante, compartilhado entre catálogo, assinaturas, faturas, pagamentos e
vínculo de Checkout. O SDK nativo usa dez segundos por chamada e nenhuma
retentativa automática configurada; verificações de prazo recusam respostas
tardias e a persistência continua exigindo a admissão pelo relógio do banco.
Os padrões dos consumidores legados são preservados. A composição nativa de
conciliação passa a reutilizar catálogo, modo e clientes do Checkout; ainda não
há cron/webhook implantado. Novas regressões de prazo aguardam gates remotos.

A candidata operacional expõe `POST /api/jobs/conciliacao`, exclusivo do segredo
do agendador, com modo desligado explícito. Conta as reservas, confirmações,
revisões e falhas técnicas; resposta parcial é 503 e execução falha em `ops`.
Falha de um pagante não interrompe o atendimento do seguinte. Gate comum cobre
autenticação e modo desligado; jornada financeira usa dois pagantes reais no
banco e dois transportes Stripe fechados para provar sucesso parcial sem ocultar
a falha. Ainda aguarda qualificação e configuração do cron, sem implantação.

`146b0932` concluiu os treze gates `44299049292`, incluindo as quatro provas
de Checkout vinculado ao UUID do aceite e validade absoluta. O gate comercial
usa PostgreSQL e SDK Stripe por transporte HTTP fechado; não é pagamento real.

A candidata seguinte compõe o executor nativo em modo exclusivo `sandbox`:
conferência somente de leitura do catálogo antes da marca, tentativa durável,
captura técnica da resposta e nova autorização nativa antes de devolver qualquer
resultado financeiro. Falta de resposta mantém revisão; sessão concluída não
concede acesso. Destinos Stripe HTTPS são conferidos pelo package compartilhado.
Um gate adicional cobre perda de resposta, indisponibilidade após criação,
logout em resultados abertos/concluídos/expirados, troca real para PIN infantil,
catálogo divergente e isolamento entre contas. Ainda não executado nesta fonte;
modos e variáveis comerciais de produção continuam inalterados.

O primeiro executor `6a0eeb66`/`44302958581` encontrou colisão da identidade
externa sintética (`cs_test_1_native`) entre cenários; a constraint de unicidade
foi preservada. A fixture passou a usar o UUID próprio de cada autorização em
`3b8995f4`. O gate `commercial-checkout` de `44303284384` passou os dez cenários;
demais gates ainda em execução nesta leitura. A execução anterior foi substituída
e cancelada; não representa aprovação integral.

`3b8995f4` concluiu os catorze gates `44303284384`, com os dez cenários do executor.

A interface seguinte usa sessão nativa, apresenta quatro ofertas do catálogo
comum e cobertura do domínio, guarda aceite explícito de recorrência e permite
reler/encerrar pedido nunca enviado. Alterar a oferta desmarca o aceite. Checkout
só aparece no modo de homologação, em ação separada; retorno do navegador não
ativa assinatura. Resposta desconhecida exige consulta antes de outro envio.
A jornada `commercial-ui` cobre dois adultos sem jogador, escolha/recarga,
encerramento e ausência de customer/concessão/envio, com capturas de 390 px.
Interface e jornada ainda aguardam execução remota nesta candidata.

`4f735856`/`44303875582` concluiu os quinze gates. A recuperação somente por
consulta `352de48b`/`44304898360` também concluiu os quinze gates, com onze
cenários no executor e a mesma jornada nativa de assinatura.

Em `4f735856`/`44303875582`, a jornada `commercial-ui` passou; as duas capturas
foram baixadas e inspecionadas em 390 px. Artefato `14427695847`, 155414 bytes,
SHA-256 `e8171480b66019bc463763723469f68bb5fff08452140d11fa8161717abc9e73`.
Preços, seleção, recorrência e recibo cabem na largura; a lista de ofertas usa
rolagem vertical. CI compartilhado `44303897143` e demais gates ainda em curso.

O incremento de recuperação seguinte separa consultar a tentativa já iniciada
de criar Checkout. Consulta não chama catálogo nem POST do provedor e nunca
marca como enviado um pedido novo. Mantém revisão diante de ausência de resposta,
revalida o contexto nativo e conserva o UUID/prazo. O botão de pedido enviado
passa a usar exclusivamente essa leitura. Aguarda verificação remota.

### Próximo incremento: conciliação e prova financeira

Schema preparatório `49c14d6d` gerado em `44305185954`: artefato `14427184646`,
66397 bytes, SHA-256 `7d39889fcc3b876b718ac206c0844d8d5b7f13e94da6f1956e1b332a9d75aace`.
0207 `colossal_komodo`: SQL 3791 bytes/
`33d4ce325c51b7cb28f36d5af8cc3e2bdefc4e6ec1746bd78fdad3e57423b741`;
snapshot 955507 bytes/`22541e13c63c1b89f77bfaba465dfb6ef5954e2607af55386bee604555511630`;
journal 31407 bytes/`b78b8e74a9f520f6bcfa515bcd29539bba794c05e9db4cdac759e7a8d726a8da`.
Snapshot `200ff4f3-07e9-4014-ae64-dbd641acdc3c` segue `ca3febaf-efde-4d6c-83af-0bb636064bd9`.
Três arquivos/hashes e o prefixo integral de 207 entradas foram conferidos;
adotados intactos. Campo de modo aditivo tem default `dev`, pois o histórico de
compra desta candidata só admitia sandbox; envio futuro confere o modo persistido.
Fila ainda não é conciliação implementada. Nenhuma DDL comercial em produção.

A implementação seguinte agenda a fila atomicamente com a tentativa de compra,
reserva um pagante por vez com lease/SKIP LOCKED e ordenação de vencimento,
registra tentativa antes da rede e preserva confirmação anterior nas falhas.
Retomada invalida o token do executor antigo. A composição técnica do grupo usa
as mesmas contas ordenadas e releitura de vínculos, sem fabricar sessão nativa.
Resultado, auditoria e revalidação de SIDs são transacionais. Sete provas isoladas
cobrem concorrência, atendimento após falha, ausência de customer, logout,
confirmação anterior, retomada e rollback. Ainda não é o leitor de pagamentos,
o webhook, o cron ou a nova admissão por fatura conciliada; esses passos seguem
abaixo, antes de ativar qualquer venda. Esta implementação aguarda gates remotos.

`5967c347`/`44307131750` passou os dezenove cenários comerciais (sete da fila),
mas o gate de qualidade encontrou formatação ainda não estabilizada da nova
fixture. A saída de `check --write` foi seguida por conferência sem escrita;
o corretivo preserva comportamento e exige nova execução. Não tratar a execução
com essa falha como fonte integralmente aprovada.

O próximo incremento expõe `@informach/billing/user-payment-snapshots`, que grava
a observação completa do customer dentro de um savepoint: confere app/pagante,
recusa assinatura de outra conta antes de alterá-la, exige todos os contratos
conhecidos e usa o motor comum de períodos. Observações antigas/contraditórias,
fatura ausente e mudança de identidade imutável revertem o lote inteiro; nenhum
histórico é apagado para acomodar divergência. Nove provas PostgreSQL usam
snapshots declaradamente sintéticos, incluindo duas faturas e isolamento entre
contas. Não representam comunicação real nem pagamento sandbox. Gates pendentes.

O gate SQL de `9587ac13`/`44305718341` encontrou uma fixture que violava duas
restrições simultaneamente: esperava FK `23503`, mas colidia antes na unicidade
`23505`. As 1113 outras provas passaram. O corretivo testa pagante estrangeiro
na partição de modo ainda livre e testa a unicidade à parte, preservando ambas
as constraints e a expectativa exata da FK; exige nova execução integral.

0208 acrescenta vínculo único opcional da assinatura ao aceite já vinculado ao
Checkout. Geração `44309018134`/`dc4c77e4`, artefato `14430150678`, 65990 bytes,
SHA-256 `8d11602ed478a53522007412db2936d316f647af871db1fb99c1f0772b85dd55`.
SQL `0208_tan_menace.sql`: 895 bytes/
`c32731130be82b7a53e8df7158b1d5542506736cfd212a416a634c370ba6ea43`;
snapshot: 956847 bytes/`42403e05464aa93fcd4494de22586996ecef6e62ea73b2a8ccb2eab56177f56c`;
journal: 31547 bytes/`4a6991f8b9728825d60327a0e0bcc92eab044d6d07f2a19a7662e4b9b2d6ad33`.
Snapshot `dea623ef-8a6b-4f5a-a4cf-130199c85867` segue `200ff4f3-07e9-4014-ae64-dbd641acdc3c`;
três hashes e prefixo de 208 entradas conferidos, arquivos adotados intactos.
Geração anterior substituída não foi adotada. Campo aditivo conserva registros
antigos sem inventar vínculo; o adapter novo exige origem conhecida para acesso.

A candidata captura o ID de assinatura recebido pelo Checkout sem tratá-lo como
pagamento. O leitor comum passa a fornecer a proveniência selecionada dos
metadados e admite conferência explícita do modo, mantendo o contrato dos
consumidores antigos. Quatro provas do SDK com HTTP fechado cobrem origem,
metadados ausentes e modo alheio em contrato/fatura. Três provas SQL adicionais
cobrem vínculo sem tentativa, expiração incompatível e duplicidade de assinatura.
Ainda aguardam gates; webhook, conciliação e admissão por pagamento seguem abertos.

CI compartilhado `44303897143`/`4f735856` passou os consumidores anteriores e a
integração comum do Recreio, mas falhou no `trial-setup`: três etapas novas não
tinham o override de `DATABASE_URL` e usaram PG 16/5432 em vez do PG 18/5433 já
provisionado. Cada etapa passa a apontar explicitamente ao serviço próprio;
o teste negativo de PG 16 permanece e nenhum timeout é removido. Contrato do
limite em [PostgreSQL 17](https://www.postgresql.org/docs/17/runtime-config-client.html#GUC-TRANSACTION-TIMEOUT).
O CI antigo não é aprovação integral; a configuração corrigida exige nova execução.

`b470a71e`/`44308578255` concluiu os quinze gates, com 28 cenários comerciais.
`6fcd1f71`/`44309656644` também concluiu os quinze, incluindo 0208 e as provas de
origem/modo. CI compartilhado corrigido `44309938778` usa `93b70ec6` e segue em
execução; não confundir a fonte/abrangência dos dois workflows.

A candidata seguinte acrescenta processador somente de leitura do provedor:
catálogo, customer, contratos, origem nativa e vínculo do Checkout são conferidos
antes da persistência transacional. Aceite sem liquidação permanece pendente;
fatos adversos e desaparecimento de evidência conservam o histórico. A admissão
técnica usa relógio DB e tem prazo de dois minutos para confirmar a observação.
O gate `commercial-reconciliation`, com PG/SDK e HTTP fechado, cobre o caminho
completo da gravação; não é homologação real em Stripe sandbox.

A regra pura `limiteDoPagamentoConciliado` limita por período, cancelamento,
fatura vigente, origem e conferência de quinze minutos; estorno do período ou
contestação impedem cobertura. Um período antigo estornado não é aplicado à
fatura atual. A regra ainda precisa ser conectada à admissão e ao cron/webhook:
o adapter em produção continua sem venda habilitada e não deve ser anunciado
como acesso pago homologado. Composição real e jornadas financeiras seguem em
implementação; os novos gates desta candidata estão pendentes.

- Criar estado comercial próprio por pagante/grupo exatos, com fila recuperável,
  próxima tentativa, última tentativa e última confirmação distintas. Falha não
  atualiza confirmação. A fila precisa atender outros pagantes após uma falha.
- Toda leitura do provedor ocorre sob o ciclo financeiro e fora da transação.
  Persistir espelhos e períodos pelo motor comum, sem aceitar desaparecimento ou
  mudança da identidade imutável de fatura/linha. Divergência preserva histórico e
  exige revisão explícita. Cobrança concluída não equivale a fatura liquidada.
- Na admissão, assinatura paga exige período conciliado vigente, preço correto,
  ausência de estorno total/contestação e conferência recente e sem revisão.
  Intersectar esse prazo com assinatura, cancelamento e aparelho. O teste gratuito
  nativo continua sendo concessão própria; não fabricar fatura para autorizá-lo.
- Webhook assinado apenas admite fatos do customer Recreio/modo corretos e
  agenda conciliação idempotente. Evento adverso bloqueia prontamente a cobertura;
  não apagar progresso. Recibo financeiro e invalidação das SIDs são atômicos.
- Gerar DDL no GitHub, adotar os arquivos intactos com hashes e predecessores,
  provar upgrade/replay e os consumidores. Testes sintéticos devem registrar
  explicitamente os fatos financeiros que desejam provar; não reduzir o contrato
  novo para conservar fixtures baseadas apenas em status.

`2a8fa076` passou nos nove gates `44285538484`, incluindo consentimento nativo
e retirada, modos reais `off`/`setup`, integridade SQL e regressões. A interface
`0523217f`, `44289414523`, acrescenta página própria sem exigir jogador e passou
nos dez gates. `trial-ui` comprovou duas contas, recarga, retirada e ausência de
perfil, concessão, SID ou claim.

A candidata seguinte acrescenta ingresso elegível distinto de gameplay e
início da concessão apenas na abertura transacional da primeira SID. O ciclo
financeiro precede contas → grupo → perfil → aparelho; não se autentica o
pagante por representação. O savepoint reverte a concessão também nas recusas
retornadas pelo kernel. Recibo/auditoria só são inseridos depois da SID real.
Gate próprio `trial-experiment` cobre o modo real, sem ligar teste nos testes
antigos de falta de acesso. As nove provas passaram em `90310297`; a compilação
rejeitou o alargamento de `cohort` para string. O retorno foi tipado com a união
fechada, sem cast. O primeiro ensaio `4d1c65a6` também encontrou duas fixtures
incorretas: chave UUID no lugar de 32 bytes base64url e lookup do catálogo
sintético ainda fechado no array original. Ambas foram corrigidas, preservando
as validações reais. `4d1c65a6`/`90310297`/`96bebae0` tiveram as execuções
substituídas canceladas; não são fontes integralmente aprovadas.
`7865be4f`, `44291557541`, concluiu os onze gates, incluindo as nove provas de início.

A etapa seguinte fecha a preparação do mundo antes da primeira sessão: prévia,
criação e leitura do próprio mundo podem usar a elegibilidade consentida sem
concessão, claim ou cronômetro. Convites, participação em outro mundo e chamadas
do SDK permanecem no kernel completo. As travas de mundo/criador continuam antes
do perfil. A estante distingue essa preparação do acesso já concedido.
Uma prova adicional de servidor e a jornada `trial-play` com o contador físico
cobrem preparar → abrir SID → jogar → salvar → reabrir, sem reiniciar o teste.
`77510596`, `44292518300`, concluiu os doze gates, incluindo `trial-play` e as
dez provas de `trial-experiment`. A jornada
física usa o contador da plataforma; não comprova diversão do Morada.

A política seguinte de catálogo reutiliza o leitor Stripe do billing, com
opção explícita de troca de plano na aplicação. A política original de três
argumentos da Suíte Edi permanece exigindo um produto e os preços expandidos.
No Recreio, os quatro preços vêm do catálogo comum, podendo pertencer a dois
produtos; o portal precisa manter troca desligada, cancelamento no fim sem
pró-rata, faturas/pagamento, URLs e app próprios e login público desligado.
O SDK Stripe real é usado nas provas com transporte HTTP de fixture, sem casts
de cliente e sem rede externa. `65f7115b`, `44293925035`, concluiu os doze gates,
com a recusa explícita de metadados ausentes (`null`) apontados pela tipagem.
Isso não é homologação com Stripe sandbox.

As capturas de consentimento/recibo de 390 px de `0523217f` foram inspecionadas,
artefato `14420742446`, 178962 bytes, SHA-256
`11419ed3ae027f8722419213feb878544ca14a86cb7765e53af69166b74c252c`.

O schema seguinte fixa aceite financeiro nativo antes do I/O, separado do teste.
0206 foi gerada por `44294538450`/`37ac9cfe`, artefato `14422234936`, 65793 bytes,
SHA-256 `67a4fb7d5460c0da819a7ec7ba132311afc9270fb8fc824461005f0d80084745`.
SQL `0206_mixed_shiver_man.sql`: 3887 bytes,
`db68ce397d3e0c5d16065fafd3aca4f0e320bf69e3e235e56d80c48bc6301635`.
Snapshot `ca3febaf-efde-4d6c-83af-0bb636064bd9` segue
`8a65327a-2288-4884-81c9-8c735453b5c6`; três arquivos/hashes e todas as 206
entradas anteriores conferidos, adotados intactos. Nenhuma geração local.
O backend nativo prepara/lê/encerra pedido nunca enviado e registra a tentativa
antes de rede; a marca impede afirmar ausência de efeito após resposta perdida.
Modo comercial só aceita `off`/`setup`; não existe caminho de cobrança ligado.
Integridade, modos reais, autoridade infantil, unicidade/recuperação e bloqueio
do primeiro teste durante preparo financeiro aguardam os novos gates.
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

Migrations F5 0191–0203 foram aplicadas e conferidas; 0204–0206 comerciais
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
