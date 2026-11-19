# Recreio: exportação e encerramento da participação

Execução autorizada no fechamento F7, independente do Morada D3–D8.
Implementação em curso; este plano não habilita exclusão, cobrança ou tráfego.
As validações manuais ficam reunidas no final, conforme decisão do titular.

Próximo incremento: recibo próprio `account_closure_finances`, vinculado à
operação/solicitante/tipo originais. Congelamento, outbox assinada e seleção
financeira serão uma TX; efeitos destrutivos continuarão bloqueados até prova
do inventário completo e da parada das renovações. Nenhuma ausência local ou
resposta HTTP isolada confirma isso. Recibos de cancelamento existentes serão
preservados, sem substituir seu aceite, ator, fonte ou datas.

A conta sem cliente terá evidência explícita `no_customer`, após conferir que
nenhuma tentativa admitida existe. Conta com cliente exige inventário do
provedor, origem/namespace e conciliação de todos os contratos/Checkouts antes
da confirmação. Agendas ou origens desconhecidas permanecem em conferência.
A geração e o escritor privado estão documentados abaixo. Aceite público e
conclusão integral do encerramento continuam pendentes.

A revisão do schema 5667c421 encontrou a semântica SQL de NULL no contador
de tentativas: o segundo ramo precisa exigir `request_started_at is not null`.
Também foi acrescentada finitude às datas da participação. A geração inicial
44623327745 não autoriza adoção; regenerar a partir da correção, sem editar SQL
ou snapshot gerados. Provar os dois casos no PostgreSQL descartável.

A geração corrigida 44623570754/01288283 foi conferida e adotada intacta:
0238/239 recibos candidatos, novo recibo e somente a nova condição de finitude
na tabela anterior de participação. Prefixo/predecessor, hashes e as demais
tabelas foram conferidos. Cinco comandos aditivos, sem migração em produção.
O ZIP original 44623327745 foi preservado e seu recibo marca `adopted=false`.

O consentimento privado candidato agora exige V2/três aceites, conserva o ciclo
financeiro antes da TX e toma UPDATE das identidades em ordem antes de mundos,
perfis e aparelhos. Reconstitui todo o escopo; outbox assinada, congelamento de
perfis/mundos, encerramento de pedidos nunca enviados, participação `closing`
e recibo financeiro `pending` são atômicos. Contexto infantil não vira gestão
adulta ao retirar o perfil ativo. Replay conserva os bytes/login/fonte originais
e não atravessa os tipos de operação. Sete testes novos aguardam qualificação.
Isso não confirma parada de renovação, exclusão, publicação no livro ou estado
`closed`; os executores destrutivos continuam exclusivos de `retirar_perfil`.

44624775249/e50defd3 passou upgrade e 123 de 126 casos. Três falhas estavam
nas fixtures novas: a compra precisava declarar o inventário do perfil existente
(mesmo sem cobertura) e a recusa síncrona do schema precisava ser verificada
como exceção síncrona. Corrigidos os testes sem relaxar as regras de seleção ou
os três aceites; repetir o gate antes de qualificar este consentimento.

44625575026/ad3e6cad apontou que IDs brutos do banco não têm a marca `PerfilId`
esperada pela compra já validada. A fixture agora passa o pedido pelo schema
real de entrada antes de chamar o repositório, sem cast; repetir a qualificação.

25f86c30 passou direitos 44625930222: 126 testes/11 arquivos, incluindo os sete
novos casos, além do upgrade. Quality 44625934750 aprovado. A prova de integridade
inclui contador sem tentativa, confirmação parcial, outro solicitante e datas
infinitas. Não há conclusão financeira, efeito destrutivo de encerramento ou
ativação em produção a partir desses resultados.

Reader de inventário Stripe em candidata, somente GET: cliente próprio,
contratos/compras de origem nativa, namespace e paginação completa limitada.
Página repetida/vazia após continuação, contrato conhecido ausente e origem
desconhecida falham. Checkout aberto ou completo ainda sem liquidação aparece
como pendência, sem afirmar ausência. Não expira, cancela ou cria recursos.
SDK/API continuam fixados; consultas às referências primárias por Context7:
[assinaturas](https://docs.stripe.com/api/subscriptions/list) e
[Checkouts](https://docs.stripe.com/api/checkout/sessions/list).
Testes HTTP novos aguardam gate; composição do coordenador financeiro ainda
pendente. Observação do inventário não é, isoladamente, conclusão de exclusão.

O reader HTTP b1055d38 passou quality 44627066896. A restrição de tipo dos
executores 6b3947a2 passou direitos 44628387749, incluindo a publicação V2
PG/S3; quality ainda em curso na última consulta. O coordenador financeiro e
a ampliação autorizada dos efeitos continuam pendentes.

Revisão do encadeamento encontrou que a seleção genérica de efeitos/fotografias
não filtrava o tipo, apesar das recusas posteriores em cadastro/transformação.
Isso podia encaminhar uma operação de encerramento publicada a uma etapa de
perfil antes da prova financeira, ou marcá-la incorretamente em revisão. As
capacidades existentes agora selecionam/revalidam somente `retirar_perfil`.
O coordenador financeiro é quem deverá admitir a capacidade de encerramento
com sua prova completa, ainda em implementação. Nova prova PG/S3 publica uma
V2 e verifica que ela continua admitida/financeiramente pendente sem efeitos
genéricos. As versões anteriores nunca foram ativadas em produção.

Sequência do coordenador financeiro: reservar um recibo devido; sob o ciclo do
pagante e fora do I/O, conferir prefixo/intenção/plano V2, participação `closing`
e a origem de cliente/compras/contratos. Inventariar Stripe fora das TX. Ausência
de cliente só confirma com prova local de que nunca houve tentativa admitida;
cliente existente exige o inventário completo, mesmo sem contrato local.
Contrato conhecido sem origem nativa, namespace misturado, página incompleta ou
Checkout inesperado permanece em conferência, sem encerrar dados.

Para cada contrato próprio, preservar cancelamento existente ou enfileirar um
novo vinculado à operação. Neste último, `authenticatedAt` e `acceptedAt` são
as datas originais do consentimento de encerramento (que já era recente),
nunca o login/data de um operador. O worker de renovação faz o I/O. A coordenação
aguarda recibos confirmados e novo inventário sem Checkout pendente e com todos
os contratos terminais ou com parada confirmada, preservando períodos pagos.
Revalidar o escopo local após a rede; confirmar recibo/auditoria na mesma TX,
com relógio PG, lease e backoff. Só essa prova permitirá ampliar os executores
e concluir os próprios domínios/participação; o ledger/publicador continua
conservando o pedido original, sem reinterpretar prévias V1.

O inventário local mínimo de assinaturas pertence ao reader compartilhado de
billing, com escopo próprio e teto de 600, sem dar ausência por truncamento.
A cópia da conta inclui o estado/datas/resultado do acompanhamento financeiro
do encerramento; não expõe referências Stripe, SHA de provas, lease ou intenção
assinada. Novo caso nativo cobre a cópia durante `closing`, ainda sem gate.

59629943 passou direitos 44629272879 e quality 44629280631: cópia do estado
financeiro e reader SQL completo/limitado qualificados. Coordenador privado
agora em candidata: lease individual, original assinado e barreira relidos,
inventário fora de TX/ciclo antes de TX, releitura do escopo e confirmação
estrita. Ausência de cliente só admite `no_customer` sem qualquer tentativa
histórica; cliente existente sempre exige Stripe, mesmo com zero contratos.

Só contratos ainda sem parada geram cancelamentos vinculados à operação,
com as datas/fonte originais do aceite; os terminais históricos não criam
trabalho financeiro novo. Recibos pendentes são aguardados; reativação ou
adiamento depois de confirmação falha. O resultado real do adapter é vinculado
em memória ao escopo/observação: cópia JSON, outro cliente/operação ou alteração
do resultado não são prova. Rodadas sem financeiro devido evitam leitura extra
do livro externo. Configuração real/capacidade pública continuam desligadas.
Testes deste coordenador e qualificação remota ainda pendentes.

## Exportação

A cópia de perfil já tem captura consistente, artefato cifrado de dez minutos,
download autenticado/revogável e prova remota de três jornadas. Ela não contém
os fatos pessoais da conta/pagante. A exportação será apresentada em escopos
explícitos: dados da conta no Recreio e dados de cada perfil próprio ou sob
responsabilidade atual. Ter pago um contrato não concede cópia de outro adulto.

1. Generalizar o artefato existente com escopo `profile`/`account`, preservando
   os registros anteriores como perfil. Conta não exige jogador; nenhum perfil
   artificial será criado. Gerar/adotar o DDL intacto pelo GitHub.
2. Capturar numa fotografia SQL os dados da própria conta no Recreio: identificação
   usada no portal, declaração de responsabilidade, dados públicos dos próprios
   aparelhos, histórico de aceite/compra/troca/contrato e pedidos de direitos.
   Paginar projeções explícitas. Não copiar sessões/tokens/hashes/segredos,
   contato de convidados, denúncias alheias ou conteúdo de outros aplicativos.
3. Reutilizar cifragem, quota, prazo, substituição, revogação e admissão após
   abertura. O modo conta usa autoridade nativa irrestrita atual, sem substituir
   a autorização própria/parental exigida para cada arquivo de perfil.
4. Qualificar conta sem jogador, titular convidado, outro pagante na família,
   chamada infantil direta, revogação/prazo/auditoria e a interface de 390 px.
   Os arquivos continuam com seus escopos explícitos; não anunciar cópia de
   mundos ou dados de terceiros como exportação integral.

## Encerramento

Encerrar o Recreio é separado de excluir a identidade Informach. A prévia
atual de `encerrar_conta` não contém aceite financeiro nem executa a operação.
Ela não pode ser reinterpretada como cancelamento de contratos ou autorização
para apagar perfis não selecionados.

1. Persistir participação nativa `active`/`closing`/`closed` e revisão. A conta
   continua apta a atendimento, direitos e gestão dos próprios fatos financeiros.
   Congelamento deve impedir novos jogadores, testes, compras e concessões;
   não basta ocultar botões. Inventariar todos os escritores e suas travas.
2. Preparar plano versionado com seleção completa de perfis/responsabilidades,
   mundos e pendências financeiras. O adulto pode transferir responsabilidade
   pelos fluxos com aceite existentes ou incluir a retirada no consentimento;
   não fabricar aceite de outro adulto. Mundos compartilhados exigem sucessão
   quando a pessoa retirada ainda é responsável.
3. Registrar confirmação explícita do encerramento e do tratamento financeiro,
   com login recente e plano relido sob trava. Coordenar Checkouts/agendas e
   contratos admitidos por seus recibos recuperáveis existentes, incluindo
   resposta perdida e fatos desconhecidos. Consulta ausente não prova cancelamento.
4. Só concluir quando efeitos financeiros, perfis, aparelhos e dependências
   consentidos tiverem seus recibos. Conservar períodos/fatos financeiros e
   direitos dos outros adultos; retenção técnica não é anonimização. Reabrir
   participação futuramente exige decisão própria e não reanima credenciais,
   perfis apagados ou testes já utilizados.

## Recuperação e implantação

### Plano financeiro v2 em composição

67d541a5 concluiu quality 44609205600 e direitos 44609210682 para o codec v2.
O leitor/preparador seguinte e69bee7c falhou no typecheck em 44610776863 e
44610785415: a chave de `billing_contracts` é `subscriptionId`, e o helper de
compra de teste precisava do tipo `AceiteDaCompra` para conservar os literais
de versão. Correção nas referências e na anotação do retorno, sem casts ou
mudança de regras; os oito novos casos não haviam sido executados nessa rodada.

O codec distingue `recreio-previa-encerramento-v2` da prévia legada v1.
Somente encerramento admite esse formato, com revisão ativa da participação,
cliente próprio exclusivo do Recreio e referências ordenadas de compras/trocas
comprovadamente não enviadas. Três aceites separados vinculam encerramento,
retirada dos perfis e cancelamento da renovação. Não há identidade, cliente do
provedor ou plano financeiro vindo do formulário.

O SHA autentica o plano privado completo; sua projeção de interface mostra
efeitos/contadores e omite referências Stripe e IDs dos aceites financeiros.
Mudança de modo, cliente, seleções ou revisão exige nova preparação. Bytes
canônicos v1 continuam iguais e suas prévias não ganham autoridade financeira.
O registro de preparação e a intenção mantêm seu próprio formato v1, separado
da versão do conteúdo do plano. Não há alteração de DDL neste codec.

A composição pública ainda produz v1. O preparador privado v2 conserva ciclo
financeiro antes da TX e login nativo recente, usa a mesma seleção de perfis/
mundos e limita as autorizações não enviadas. Cliente e Checkout vêm do reader
`@informach/billing/recreio-account-closure`, escopado por app/pagante. Namespace
diferente, tentativa iniciada, revisão pendente ou Checkout sem origem nativa
correspondente exigem conciliação. Nada disso é interpretado como ausência de
efeito remoto. O plano privado é persistido uma vez; mudança posterior marca
a prévia desatualizada e exige outra, sem reescrever os bytes anteriores.

Esse incremento não confirma encerramento, não chama Stripe e não muda
participação. Seguem confirmação/outbox, tratamento recuperável das pendências
e executor financeiro com recibos. A interrupção da renovação precisa também
impedir que uma capacidade antiga do portal financeiro a reative; esse caminho
deve ser qualificado antes de compor a confirmação pública.

### Barreira de participação em implementação

`account_participations` distingue legado ativo (ausência/revisão zero), ativo
persistido (1), encerramento (2) e encerrado (3). A FK composta exige operação
de encerramento do mesmo solicitante; retirada de perfil e operação alheia não
podem ser usadas como origem. Identidade comum, finanças e mundos não têm cascade
destrutivo. Não há writer público, retomada automática ou nova declaração de
consentimento neste incremento.

Admissão nativa comum e kernel de jogo exigem participação atual ativa. Direitos
pessoais e gestão/leitura/cancelamento financeiro usam finalidade explícita,
conservando a mesma identidade, contexto adulto, aparelho e login. Não concedem
novas compras/trocas/testes. Aceitar convite também confere o titular do grupo,
impedindo anexar um novo membro a um grupo em encerramento.

O coordenador deve conservar o ciclo financeiro externo antes da transação,
mutexes de contas em ordem e UPDATE na identidade antes de mudar a participação.
Leitores conservam SHARE nessa identidade. Admissão para escrita/jogo exige
`read committed`: um snapshot antigo anterior à espera não comprova estado
atual; a captura de direitos mantém seu `repeatable read` sem conceder escrita.
Perfis selecionados e capacidades de jogo ainda precisam ser congelados na mesma
transação do consentimento completo. Esta base não executa o encerramento.

Schema e código seguem para geração/qualificação no GitHub; não foram migrados
ou habilitados em produção. O plano v2, coordenação financeira, consentimento,
workers e conclusão continuam obrigatórios.

A geração inicial 44604567639/1ceeea68 produziu FK antes da UNIQUE composta
referenciada. O artefato 14568114251 (ZIP SHA-256
`91f8856bfde21da8f0713226f196d08be7a55cea159772f2dd2bb363b8fa56d2`)
foi recusado na leitura, sem adoção do SQL. A geração é separada: primeiro a
UNIQUE aditiva de `rights_operations`, depois a nova tabela/FK. O schema da
nova tabela sai temporariamente do índice apenas na fonte intermediária do
gerador; essa fonte não é candidata a deploy ou gate do app. Arquivos gerados
não são reordenados ou editados manualmente.

A UNIQUE 0235 foi gerada em 44605065615/951b40ff e a tabela 0236 em
44605491318/19928a64, ambas adotadas byte a byte após SHA, predecessor e prefixo
do journal. Na segunda geração, todas as tabelas anteriores permaneceram
idênticas. 237 recibos candidatos; nenhum DDL aplicado em produção. Recibos em
`evidencias/migracao-participacao-{unique,tabela}-*.json`.

As provas preparadas conferem legado sem jogador, bloqueio dos escritores em
`closing`/`closed`, manutenção da leitura financeira/direitos, autenticação
infantil recusada, FK de solicitante/tipo, snapshot antigo recusado e espera
real por trava PostgreSQL. As operações usadas para testar a barreira são
fixtures estruturais assinadas; não demonstram consentimento de encerramento
v2, processamento ou liquidação financeira.

44605848173/33a7b721 preservou as duas cópias no upgrade 234→237, mas o
typecheck recusou a fixture infantil, que usava número numa coluna UUID.
Corrigido para UUID real, sem cast ou mudança no schema. Os casos nativos não
haviam sido executados nessa rodada; a candidata precisa de nova qualificação.

44606233777/8b2051c0 passou typecheck e 109/110 casos; a única falha era a
expectativa nova de `trocas=null` numa conta com grupo próprio. O contrato
existente devolve DTO com grupo/data e `contrato/pedido=null`; a fixture foi
corrigida, sem alterar o reader. A navegação candidata passa a mostrar apenas
a conta em encerramento, mantendo dados/assinatura e redirecionando estante,
criação e seleção de perfil. Novas provas de navegador usam somente estado
estrutural em banco descartável e baixam o arquivo real; não consentem ou
executam encerramento em produção.

d3475f2e concluiu 111 casos/9 arquivos e upgrade 234→237 em 44607167200;
as seis jornadas de navegador passaram em 44607175365 (38,7 s), com capturas
390 px de ambos os estados inspecionadas: leitura, links e largura adequados.
O recibo `evidencias/participacao-ui-44607175365.json` conserva fonte e hashes.
A rodada completa 44607183659 permanece em execução nesta anotação. O ajuste
seguinte também impede nova prévia depois de iniciar o encerramento, conservando
histórico/cópias e replay da referência original; exige nova prova focada.

Intenções externas conservam os IDs e o consentimento original. Reaplicação
offline não pode criar usuários fictícios, atribuir ao operador o aceite do
solicitante ausente no backup ou exigir um novo consentimento para retirar
cópias antigas. Precisa de recibo histórico próprio e banco em quarentena.
Artefatos temporários, sessões e demais capacidades restauradas devem ser
invalidados antes de qualquer admissão de tráfego. As provas atuais de fotos
e de duas passagens do livro não concluíram esse coordenador.

Todos os gates pesados são remotos. A promoção exige fonte e DDL qualificados,
backup atual recuperável, normalização/replay, custódia, agenda/alertas e ensaio
final. A implantação das candidatas não foi realizada por este plano.

### Coordenação financeira: prova preparada

28411278 passou quality 44634257754 e direitos 44634262912. A rodada confirma
compilação e regressões existentes; os novos onze casos financeiros ainda
precisam do gate `commercial-reconciliation`. Eles usam PostgreSQL, o livro
S3 por SDK/HTTP e o SDK Stripe contra transporte fechado: ausência admitida
de cliente, inventário de cliente sem contrato, renovação após logout com
aceite original, falha e retomada, namespace/titular divergentes, alteração
durante I/O, concorrência e observação de outra operação ou copiada.

Falha interna de banco ou auditoria permanece falha técnica, com tentativa
durável e lease recuperável, sem registrar indisponibilidade fictícia do
provedor. A confirmação e sua auditoria são atômicas. O caso de auditoria
recusada verifica rollback e retomada; a renovação recebe a mesma correção.
Nenhum desses casos autoriza limpeza da conta antes da prova financeira,
conclui a conta ou demonstra implantação em produção.

O próximo incremento vincula cada executor ao mesmo recibo financeiro e plano
v2. A extensão precisa tratar todos os perfis selecionados: transformar uma
fotografia uma única vez para o conjunto e liberar cada mundo somente depois
da minimização do último perfil. O executor anterior era próprio de um perfil;
remover apenas o filtro de tipo liberaria mundos cedo demais. As provas devem
incluir dois perfis no mesmo mundo, progresso de terceiro preservado e bloqueio
antes da confirmação. Conclusão da conta continua separada da retirada dos perfis.


A primeira prova financeira 44636598646/02f2b7aa passou 151/152 casos. O caso
novo de alteração durante I/O tentou incrementar a revisão inicial sem uma
troca de plano, corretamente recusada pelo CHECK do banco. A fixture passa a
alterar um período compartilhado válido, que integra o SHA da origem; não foi
relaxado o contrato de revisão. Direitos 44636608366 passaram na mesma fonte.
O CI compartilhado 44617539778/96a9b76a também concluiu; não cobre os incrementos
posteriores automaticamente.

A candidata seguinte admite efeitos de encerramento apenas com recibo financeiro
confirmado de mesmo solicitante, operação, namespace, cliente, data de aceite e
política, e participação closing/2. Expurgo após conclusão admite closed/3.
Reservas não escolhem pendências financeiras; a conferência final sob trava
recusa divergências. Fotografias revalidam intenção, seleção, prefixo atual e
finanças após I/O. O adapter puro aceita conjunto limitado, abre/comprime uma
vez e preserva a versão; o contrato singular continua disponível.
Minimização conserva mundos congelados até o último perfil e adia expurgo até
os mundos estarem concluídos. Dois novos casos PG/S3 e três casos puros foram
preparados. Conta ainda não recebe recibo final nem ação pública neste incremento.


### Cópias em voo na transição da participação

O inventário para a limpeza encontrou uma autoridade ausente: a cópia da conta
não conservava a revisão de participação da captura. Uma captura anterior ao
encerramento podia terminar de cifrar e publicar depois dele. A correção adiciona
`personal_exports.participation_revision`, com default legado zero e CHECK 0–3,
captura a revisão na mesma fotografia SQL e a revalida ao publicar, carregar e
admitir o download depois de abrir os bytes. Não usa comparação de datas com
precisão perdida nem revoga a identidade global. Cópias novas dos direitos
continuam permitidas em closing/closed; cópias anteriores não ganham nova
autoridade. A migration será gerada no GitHub e adotada intacta após revisão.
Dois casos nativos cobrem consentimento real durante I/O e a barreira estrutural
closed/3 depois de abrir. A segunda fixture não prova conclusão de conta.


A3a0000b passou finanças 44637871880 (rodada com os onze casos novos). Direitos
44637867410 passou 131/132: a fixture de mundo sem lease esperava drenagem, mas
o consentimento já o cerca e registra frozen. A prova passa a exigir a fase
real e drainer ocioso; a barreira não foi relaxada.

0239 foi gerada em 44638655178/ba7d2338, artefato 14585700653, adotada intacta.
Dois ALTERs somente em personal_exports; demais tabelas e prefixo de 239
recibos preservados, predecessor conferido. São agora 240 recibos candidatos;
nenhuma migration aplicada em produção. O upgrade conserva os corpos opacos e
as referências anteriores, verifica revisão legada zero e recusa revisão 4.
A aplicação da barreira de cópias e os dois casos novos aguardam gates remotos.


A barreira de cópias e o caso de vários perfis passaram direitos 44639030361/c4dc3978;
finanças 44639039101 também concluiu. Qualidade a3a0000b/44637862935 aprovada.
Integração completa e qualidade da fonte c4dc3978 ainda estão em execução.

O inventário encontrou emissão de convite para destinatário já em encerramento.
A candidata move o mutex existente por endereço para antes das identidades/grupos.
Consentimento de encerramento usa o mesmo mutex antes de suas identidades UPDATE
(revalidando o endereço após a espera). Emissão relê a participação depois da
barreira, inclusive em replay de convite existente; não toma uma trava tardia
na identidade do destinatário. Isso cobre também o endereço que não tinha conta
na emissão. Novos dois casos PG/S3 usam consentimento real, inclusive concorrência.
Convites anteriores permanecem dependência explícita da limpeza; não são apagados
por esse guard nem declarados removidos. Sem novas variáveis ou ativação.


O inventário da referência mínima encontrou dados sociais que não dependem do
prazo de um token: amizades/pedidos/códigos/bloqueios e preferência de presença.
A candidata trata esses domínios antes de minimizar o perfil, em lotes de cem,
com a mesma autorização assinada, trava do perfil e auditoria estrita. O mesmo
SQL continua disponível ao expurgo para tratar sobras, sem carregar nomes ou
conteúdo. Não se espera a expiração de uma sessão para retirar esses dados.
Novo caso mantém token por uma hora e comprova retirada social imediata, prazo
original preservado e preferência de terceiro intacta. O caso de 103 códigos
agora qualifica duas passagens anteriores à minimização e a remoção física
posterior. Gates remotos ainda necessários.


### Próximo coordenador: conta e recibo final

- Reutilizar a conferência de sujeitos mínimos/prazos da retirada em
  `conclusao-perfis-repository.ts`; retenção vencida impede concluir até expurgo.
- `encerramento-conta-lotes-repository.ts` remove um domínio/até cem linhas por
  passagem, sem carregar corpos: PIN próprio, intenções de criação, avisos,
  declarações sem responsabilidade, prévias sem operação consentida, convites
  pendentes do emissor/destinatário e artefatos temporários. Convite histórico
  e prova consentida seguem sua retenção; não apagar fatos financeiros/teste usado.
- `encerramento-conta-repository.ts` descobre candidato sem trava, serializa a
  identidade e toma UPDATE nela antes da operação/participação. Revalida prefixo,
  bytes assinados, V2, todos os sujeitos/mundos, finanças e ausência de novos
  perfis/responsabilidades. Não há I/O dentro da TX de 15/5/2 segundos.
- Uma passagem registra a limpeza junto à auditoria estrita. Quando não há
  pendência, fechar participação 2→3 e operação completed na mesma TX/evento;
  rollback integral se auditoria falhar. Não renovar prazo nem reabrir teste.
- Preservar core.users e logins de outros apps, livros/consentimentos,
  cobrança/períodos e referências técnicas com prazo próprio. Sessão nativa
  continua restrita à leitura de direitos/gestão financeira pela participação;
  perfil infantil não vira adulto ao apagar PIN/perfil. Não apresentar esses
  registros como anônimos ou destruídos. Expurgo de retenções prossegue após
  conclusão. A operação não revoga períodos de outros adultos do grupo.
- Provar conta sem jogador, bloqueio financeiro, dependência de perfis, lotes,
  dados de terceiro preservados, falha de auditoria, concorrência, replay e
  cópia nova depois de closed. Consentimento/UI públicos e implantação seguem
  outro incremento após essas provas.


O escritor candidato agora compõe essas etapas e a rodada privada inclui
encerramento_conta após a retirada. Seis casos novos preparados usam o livro
S3 e consentimento nativo: zero jogador com PIN/103 intenções/convites,
rollback da auditoria final e do lote, execução concorrente, namespace recusado
e expurgo com relógio real depois de closed. Nenhum estado foi aplicado em
produção. Validação remota obrigatória antes de qualificar este escritor.
