# Recreio: visitas temporárias com anfitrião

Incremento F5 autorizado, com fundação de schema e atestado em verificação.
Negociação candidata; convites, concessões, interface e implantação pendentes. Requisitos e demais aceites no
[plano de mundos](mundos-completos-2026-11-17.md).

## Separação e autoridade

Convite de visita e concessão temporária terão tabelas próprias. Não colocar
convites de visita na tabela dos convites dirigidos de membro: um leitor antigo
poderia interpretar o UUID como autorização permanente depois de um rollback.
Visitar não insere nem restaura `space_members`, não concede gestão e não muda
progresso ou titularidade dos demais participantes.

O anfitrião precisa ser um participante permanente atual e estar na partida.
A instância atesta sua presença privada sob mundo, cerca, SID e membro atuais;
isso não é presença pública nem localização exposta aos amigos. O destinatário
é conhecido, com amizade e aprovações atuais. A decisão do mundo e as dos
responsáveis por menores são separadas. Todos os escritores conservam a ordem
de contas → mundo → perfis → aparelho/sessão → prova da concessão.

A visita fica vinculada à presença específica, ao SID e à cerca do anfitrião.
Prazo máximo de 24 horas, sem extensão em recuperação de resposta. Fechar a
presença, encerrar o SID, trocar a cerca, revogar a autoridade ou vencer o prazo
impede novas admissões. Retorno do anfitrião não reativa a concessão anterior.
Renovação de presença só mantém uma linha ativa; nunca reabre uma encerrada.

Cliente, manifesto e instância precisam negociar suporte. O Morada continua
sem essa capacidade até sua própria evolução; a plataforma provará visitas
num jogo interno independente. Endpoints e respostas de membro existentes
continuam recusando alguém que só tenha visita, inclusive em leitores antigos.

## Fundação inicial

`world_host_presences` associa membro permanente, SID/perfil, posse/cerca e
instância por FKs. A transação também precisa conferir que todos pertencem ao
mesmo jogo/mundo, que a posse está vigente e que a instância é a titular.
O vínculo sessão/perfil ou posse/cerca isoladamente não comprova isso.

Cada entrada usa UUID e hash de repetição da instância. Uma presença ativa por
perfil/mundo; nonce repetido com outro corpo é conflito. Prova de presença com
validade curta, no máximo 45 segundos desde a última atualização e limitada a
uma janela de 24 horas. Retenção técnica até 30 dias após essa janela. A rotina
precisa encerrar provas vencidas e purgar em lotes antes de eliminar sessões,
posses ou membros referenciados. As colunas não concedem acesso por si só.

## Próximos incrementos e provas

1. Gerar/conferir a migration aditiva da presença pelo GitHub, sem editar SQL,
   snapshot ou journal; testar constraints, concorrência, nonces e retenção.
2. Implementar atestado de entrada/saída e atualização em lote somente por
   instância autenticada e com posse vigente. Saída encerra definitivamente a
   prova; falha de comunicação impede readmitir visitantes até confirmação.
   Troca de cerca invalida provas da instância anterior.
3. Acrescentar convites, aprovações e concessões de visita separados, com
   amizade, versões/gerações, classificação, capacidade e prazo sob trava.
   Provar que nenhum fluxo escreve participação permanente.
4. Negociar SDK/host e implementar abertura/renovação/encerramento próprios da
   visita. Batimento e runtime precisam interromper o visitante ao perder a
   prova, inclusive sem navegador cooperante. Não anunciar SID encerrado sem
   seu recibo, nem inventar confirmação de salvamento.
5. Entregar caixa/estante temporária, confirmações familiares e revogação
   gratuita. Validar saída pelo jogo, perda do anfitrião, reconexão, queda da
   instância, relógio/prazo, troca de permissões e rollback com clientes antigos.
6. Gates, carga e builds no GitHub; conferir imagens, upgrade com dados,
   restauração e fonte/configuração reais antes de qualquer ativação.

Nenhuma tabela desta fundação foi criada em produção. F6–F11 continuam com
seus próprios critérios; os gates desta frente não encerram a plataforma.

## Geração conferida da presença

Run `44221393949`, fonte `62150c6e6dd2cabec4518915c7e28723a2c82a95`, artefato
`14390189204`; ZIP SHA-256
`35bd94cc12d21819f970654ee5609a3581c19e7b64330d71632666474c73e908`.
SQL somente aditivo, FKs sobre constraints/índices únicos já existentes,
nomes explícitos curtos e CHECK de encerramento com NULL recusado. Prefixo
do journal e predecessor do snapshot conferidos; cópia intacta por bytes/SHA:

- `0198_skinny_captain_britain.sql`: 4660 bytes,
  `4aa7976f1d8f08a9c0aad9edb68f44e235e491e4fe86f951a4e4310d779a77a8`.
- Snapshot: 888950 bytes,
  `5a30bcdc995fdd072bcb672cde5d99080dcb618bcf9ad2d4f946bbd0779b98ea`.
- Journal: 30079 bytes,
  `aa040b62e4cf6cd3f812c66042d42f4513081864f3bfe18c734c4f37dc21755a`.

Dezesseis integrações candidatas criam sessão/mundo/posse/entrada pelas APIs
reais e exercitam FKs, não duplicação, disputa de presença ativa, encerramento
com campos NULL, TTL/janela/retenção, hash e nova identidade após encerrar.
A inserção de teste da presença é direta no PostgreSQL: ainda não comprova
atestado por servidor, visita, renovação, revogação ou funcionamento de tela.
Esses testes ainda precisam executar no GitHub. Journal candidato com 199
entradas; nenhuma alteração operacional ou migration foi aplicada em produção.

## Candidata de atestado e limpeza

`POST /api/interno/v1/mundos/[id]/presencas` é restrito ao segredo e à instância
registrada do jogo. Nova entrada exige modo de visitas ativo e capacidade
explícita do manifesto; padrão `off`, e o Morada não declara a capacidade.
O contrato ainda não está integrado ao SDK/handshake da instância ou do cliente.
Atestar presença, isoladamente, não concede nenhuma visita.

A criação usa a mesma transação autoritativa da entrada de membro permanente,
com SID, perfil, cobertura, política, mundo e posse atuais. O prazo da posse
é relido depois dos efeitos e auditoria. TTL operacional de até 30 segundos,
limitado pelo SID e pela posse; janela fixa de até 24 horas. UUID/hash ligados
ao corpo e à instância recuperam o mesmo recibo sem renovar nem reabrir uma
prova encerrada. Chave com outro corpo conflita. Outra entrada do mesmo SID
precisa encerrar a anterior; cerca/SID anteriores ou prazo vencido encerram
a prova antiga sob a trava do mundo antes de inserir outra identidade.

Recuperação técnica e encerramento da própria prova continuam disponíveis
com modo desligado ou SID/posse encerrados. Não permitem escrita ou admissão
pela cerca antiga. A resposta é recibo técnico, sem nomes ou autoridade global;
qualquer admissão futura precisa reler anfitrião, visita, política e posse.

Manutenção encerra provas vencidas e remove técnicas após retenção, até 500
por lote com `SKIP LOCKED`, auditoria estrita e contagens. A rotina atual encerra
sessões antigas, sem apagá-las; o novo FK não exige alterar esse comportamento.
Encerramento de conta/F7 ainda precisa remover provas antes de desvincular
identificadores. A limpeza futura dos convites/concessões de visita precisa
preceder a remoção da presença referenciada.

Treze integrações candidatas exercitam HTTP/autenticação, concorrência e replay,
saída com modo desligado, conflito de chave, limite de corpo, instância/cerca,
SID/perfil/membro, fim de SID, manifesto sem capacidade, falha de auditoria e
prazo até o commit, expiração idempotente e expurgo 500+101. As fixtures do
último teste inserem histórico técnico diretamente, sem alegar 601 jogadores.
Gates desse incremento ainda pendentes. Renovação por batimento, negociação,
convites/aprovações, concessão, runtime e telas de visita continuam por fazer.

Fundação `a17290033a2f060ae166fe4690a4f7823f3eda59` aprovada nos oito gates
`44222402220`: 801 integrações/85 arquivos, incluindo os dezesseis testes de
schema, e upgrades 179→199/191→199. Isso não prova a API do atestado acrescentada
depois desse source. Consumidores diretos de manifesto/contratos desta candidata
são Recreio, servidor/cliente do Morada e Bastidores; seus tipos e gates fazem
parte da matriz Recreio. Os objetos do catálogo público não ativam visitas.

## Fundação da negociação

A próxima migration aditiva prepara `supports_visits=false` em sessões de jogo
e instâncias. Clientes e instâncias existentes ficam sem capacidade. O primeiro
aceite da sessão precisa conservar o resultado da negociação, inclusive na
recuperação de resposta: um retry ou mudança de modo não pode promover o SID.
Respostas antigas não recebem campos novos sem solicitação explícita. A
presença positiva também precisará conferir a capacidade registrada da instância.
Esta definição inicial de schema ainda não implementa a negociação nem cria
convite, concessão ou transporte de visitante.

Geração `44225521585`, fonte `3b7c321f0b511768016b624b917356692c024c99`, artefato
`14391989348`, ZIP SHA-256
`fa0d64b74d9e0227933b63a9b69c9416eb827bfb3b2d3ed6553dc8f4267255bb`.
SQL contém somente os dois `ADD COLUMN boolean DEFAULT false NOT NULL`.
Origem, allowlist, prefixo do journal, predecessor e cópia intacta conferidos:

- `0199_worthless_gertrude_yorkes.sql`: 222 bytes,
  `94536b8577dc956f0d5c8ead875cde3703ec4e13180de1ec341c074b2d2055f0`.
- Snapshot: 889332 bytes,
  `9df9c06dbcbd9bbb4c3828a649330e31d8a4bab1d2902eb73596522039789b93`.
- Journal: 30234 bytes,
  `ee1269e9353b373baa2b35ce1ddddad0ef1745cc462d6623e139555bfff54a21`.

O run de atestado `44225075209`/`d67b7cb9` falhou. Qualidade/builds apontaram
os três eventos ainda ausentes do catálogo tipado de auditoria. A integração
teve 809 aprovações e cinco falhas: a expiração do SID devolvia corretamente
`SESSAO_ENCERRADA` em vez do conflito esperado no teste, e quatro casos antigos
tentavam apagar sessões de outras fixtures agora referenciadas por presenças.
A correção registra os eventos, conserva a recusa própria da sessão e encerra
as autoridades anteriores no setup, preservando histórico, referências e cursor.
Não afrouxa FKs ou limites. Journal candidato com 200 entradas; negociação e
corretivo ainda exigem evidência remota. Produção continua sem essas migrations.

## Negociação candidata

Registro de instância e troca do ingresso admitem `suportaVisitas:true`,
opcional. Só aceitam quando modo e manifesto também permitem. O resultado é
gravado na criação; instâncias/sessões legadas continuam com `false`.
Respostas sem solicitação conservam o contrato anterior, sem `visitas`.
Recuperar uma abertura consulta o bit persistido: mudar modo ou acrescentar
opção a um retry não promove a sessão. `visitas:true` descreve suporte técnico,
sem conferir admissão, permissão atual ou concessão de visitante.

Atestado positivo exige tanto sessão quanto instância com adesão persistida,
além do kernel atual de membro/posse. Não existe escrita que atualize esses
bits depois da criação. Recibo e encerramento próprios continuam disponíveis
sem depender da habilitação. Nove novas integrações candidatas cobrem matriz
de solicitação/modo/manifesto, repetição, compatibilidade e adesão de cada lado.
SDK de visitas, renovação, convites e concessões continuam pendentes.

O corretivo `6daed18f` já passou no job de integração `134540065185` do run
`44226267662`: 814 testes/86 arquivos, cinco do Bastidores e upgrades 179→200
e 191→200, preservando perfis, progresso, mundos, membros, fotos, diário,
convites e cerca. Os demais gates ainda estavam em execução nesta leitura.
Essa evidência não cobre o código de negociação acrescentado depois.

Extensão candidata `ClienteDoHostComPresencas`: `atestarPresenca` usa a rota
autenticada da instância e valida a resposta com o contrato compartilhado. O
host básico/memória não passa a prometer visitas. Falha de rede não gera retry
ou confirmação inventada; quem chama precisa repetir explicitamente a mesma
chave, sem readmitir visitantes enquanto a situação não for conhecida.
Quatro testes de transporte e uma integração HTTP real cobrem entrada/saída,
escopo, resposta inválida, posse perdida e recuperação de recibo fechado com
modo desligado. Ainda pendentes de execução remota; não integra o Morada.

O run `44226267662` terminou com sete gates aprovados e E2E reprovado: 37
jornadas aprovadas, uma falha em `familia-cadastro` por exigir aviso fixo de dez
minutos. Artefato `14393781425`, fonte `6daed18f`, ZIP SHA-256
`370c02236a75c0ddcd2e5650e099b31aa62fa7a6fe4cb3b25e09fcbcc3c3acb7`,
conferido após download: o contexto registra aviso de **seis minutos**, às
02h54 UTC/23h54 em Brasília. A projeção limita a sessão na virada do dia;
integrações de tempo já exercitam `day_change`, inclusive horário de verão.
O E2E candidato captura a resposta real de controle, exige limite de dez
minutos, motivo diário/virada e prazo positivo de no máximo dez minutos, e
confere o texto correspondente. Não altera orçamento, relógio ou autorização.

Negociação `92c2010b` passou no job `134543207183` do run `44227206576`, com
823 integrações/86 arquivos, cinco do Bastidores e upgrades 179→200/191→200.
Os sete gates fora de E2E estavam aprovados na última leitura; não se declara
aprovação integral enquanto a jornada de navegador não terminar.

## Renovação candidata de presença

`POST /api/interno/v1/presencas/renovar` recebe de 1 a 64 provas distintas e
até 32768 bytes. Compartilha o teto de 240 pedidos por minuto por instância
com o atestado; segredo/registro do jogo são obrigatórios. Só admite modo e
manifesto habilitados. O contrato antigo de batimento não é alterado: o host
renova primeiro as posses e depois informa somente conexões ainda presentes.

Cada prova usa a admissão atual do membro, na ordem de travas do kernel,
conservando capacidade persistida de sessão/instância, mundo, cerca, SID,
perfil e membro. Processamento em grupos de quatro transações independentes,
aguardadas inclusive em falha, evita inverter travas entre contas. Todas as
consultas de autoridade de cada item continuam obrigatórias; esse limite não
substitui a medição de consultas, latência e custo do F10.

Presença encerrada, vencida ou de outra autoridade retorna somente `perdida`.
Renovação aceita conserva identidade, chave, início, janela e retenção e limita
a nova validade ao menor prazo entre 30 segundos, posse, SID e janela original.
O prazo é reconferido após esperas até o commit. Não há reabertura nem extensão
da janela de 24 horas. Manutenção/encerramento continuam separados. Assim como
o batimento da posse, a atualização periódica não emite evento de auditoria a
cada tick; criação, encerramento e expurgo mantêm seus eventos estritos.

Um lote não é atômico entre itens. Falha operacional devolve HTTP de falha,
mesmo que outro item já tenha renovado; o runtime precisa suspender admissões
e respeitar seus prazos locais, sem presumir confirmação. Não converte falha
de banco em `perdida`, nem emite recibo de encerramento de SID. O cliente HTTP
valida quantidade, ordem e IDs da resposta e nunca repete automaticamente.

Doze integrações candidatas cobrem lote misto, concorrência com saída,
expiração/janela, SID encerrado, ativação desligada, corpo/tamanho/duplicação,
identidade/cerca/instância e falha de banco ou prazo no commit. Cinco testes
de transporte cobrem registro, recusas, correlação e resposta perdida.
Ainda sem execução remota deste incremento; runtime, visitas e medição F10
continuam pendentes. Nenhuma migration ou configuração foi ativada.

## Fundação candidata de convite/concessão

Quatro novas tabelas: `space_visit_invites`, decisões de mundo e responsáveis,
e `world_visits`. Não se reutiliza `directed_space_invites` nem se acrescenta
papel temporário a `space_members`. FK composta prende origem, mundo, SID e
membro à presença original; outra FK prende a concessão ao convite, mundo,
destinatário e presença. Aprovação parental só pode corresponder a uma das
pontas e ao vínculo do próprio perfil. Gestão do mundo conserva sua revisão.

Chave de repetição por origem, um pedido pendente por presença/destinatário,
uma concessão por convite e uma concessão ativa por visitante/mundo. Prazo de
convite/concessão de até 24 horas; retenção do convite em 720 horas exatas,
sem aritmética por dia local. Estados terminais exigem datas/motivos não NULL.
Índices cobrem caixas, presença, mundo, vencimento e retenção; FKs com nomes
explícitos curtos. A retenção precisará remover concessões antes de convites
e estes antes da presença referenciada, incluindo F7.

Schema não comprova aceite, política atual, prazo da presença, classificação,
amizade ou aprovação atual: serão conferidos juntos sob trava pelo serviço.
Também não garante sozinho que uma concessão venha de convite aceito. Ainda
sem escritor de concessões, API, admissão de visitante ou runtime. Geração
aditiva será feita no GitHub; nenhum SQL/snapshot/journal escrito à mão.

A negociação `92c2010b` concluiu os oito gates `44227206576`, com 823
integrações e 38 E2E. A prova não cobre o cliente HTTP de presença ou a
renovação acrescentados nas fontes posteriores. Produção permanece na 0190.

Geração `44229091554`, fonte `5a56935c7c96a9e4b8bde070442d358c20bf517b`,
artefato `14394471748`, ZIP SHA-256
`d4b94e0945053485aa0c199bdde581718cd82d365ee768dd7717fc537894f1c2`.
SQL só cria as quatro tabelas/índices/FKs/CHECKs, sem mudar tabelas antigas.
Origem, allowlist, três arquivos, prefixo de 200 entradas, predecessor e
nomes de até 63 bytes conferidos; cópia intacta por bytes/SHA:

- `0200_tranquil_azazel.sql`: 12101 bytes,
  `531137e2af74b29272f240227cf673f37561878ec72d04b9ba02c4dfa5b48ea3`.
- Snapshot: 919710 bytes,
  `fcf631f6e0f2b7451e6525532c195dd7036c4a0c517c68e2abb00995eab7caee`.
- Journal: 30379 bytes,
  `a51bf4f46c3d2c01a1a9046c5a644f87b24f8bdb7c3ab3c9f90afb1e15e20667`.

Vinte e duas integrações candidatas de integridade exercitam associação da
presença, não duplicação, caixas/estados, prazo, campos NULL, vínculo parental,
decisão do mundo, concessão correspondente e ordem de retenção. Origem entra
pela API real de membro; presença, convite/aceite e concessão são fixtures SQL
explícitas. Mesmo com a fixture de concessão, APIs antigas recusam abertura,
entrada e aceite de membro e nenhuma participação é criada. Isso não comprova
o serviço de visita, suas aprovações atuais ou runtime. Journal candidato: 201.

Renovação `0a7c0af2` passou nas 836 integrações/86 arquivos, cinco do Bastidores
e upgrades 179→200/191→200 no job `134548057382`/run `44228674580`. Qualidade
reprovou formatação remanescente da cadeia do novo E2E (segunda passagem do
formatter corrigida e conferida sem escrita). Os avisos alheios escondiam o
erro no limite de diagnósticos; o workflow passa a mostrar erros, mantendo
os mesmos checks e a mesma severidade, sem supressão de regra.

Checkpoint teve uma falha no minuto real: a preparação de salvamento registra
`left` se o cliente parar conservadoramente antes do prazo assinado, ou
`expired` ao vencer. O teste aceitava só o segundo. A expectativa candidata
exige o par exato de sessão encerrada por `left`/`expired`, ou assinatura
inválida após a tolerância; continua exigindo orçamento real, progresso
confirmado, escrita recusada e relatório privado. Não muda timer, prazo,
auditoria ou autorização no produto. Evidência integral corretiva pendente.

## Retenção candidata de visitas

Manutenção expira convites pendentes e concessões pelo próprio prazo, em
lotes de até 500 com `SKIP LOCKED`, sem alterar membros, SID, mundos ou dados.
Estado terminal, relógio e auditoria estrita são confirmados juntos. Expurgo
trava no máximo 500 recibos terminais depois da retenção e recusa apagar
qualquer concessão ainda ativa. Apaga primeiro concessões encerradas e depois
convites (aprovações em cascata), atomicamente com o evento de contagens.
Uma falha de auditoria reverte também as remoções.

A manutenção executa essa limpeza antes da presença. Expurgo de presença
agora também exclui da seleção qualquer prova referenciada por um convite,
inclusive quando ainda faltam lotes de retenção. FKs continuam restritivas;
não se contorna referência com `CASCADE` nem se apaga participação. Seis novas
integrações candidatas: expiração idempotente, dois rollbacks reais de
auditoria, 500+101 recibos/concessões históricos, presença referenciada e
concessão ativa preservada. As 601 linhas são histórico sintético por SQL,
sem alegar 601 jogadores ou admissões de visita.

Migration 0201 acrescenta quatro índices para consulta reversa da presença,
vínculo parental e membro aprovador. Não basta o índice parcial de convites
pendentes para expurgar uma presença referenciada por recibos encerrados.
Geração `44230815797`, fonte `84e66b632afaefc920eac3dbab8cac0b64fa7216`,
artefato `14394208647`, ZIP SHA-256
`780df1f9dacce9a8bbf63bd4ce1cfc248a7c5430c55ccc1dcb7b41f97bb559b7`.
Origem, allowlist, prefixo de 201 entradas, predecessor, quatro `CREATE INDEX`
e cópia intacta conferidos:

- `0201_messy_owl.sql`: 590 bytes,
  `c2b3367837c8852fb1566a6f30503fda5330dc3046ebd839fed8d7b036f2b2e7`.
- Snapshot: 921763 bytes,
  `571f6e81b7f0a89c93aa82a4fbe33a909c4b798532ab70c3e0559838227d2608`.
- Journal: 30518 bytes,
  `4c978f2ecbd3d49552f0d6d0a47446b263e00a46c24963ffaa0441fb608f9974`.

Fundação/corretivos `e30cdbc8` já passaram em qualidade, 858 integrações/87
arquivos, cinco do Bastidores, upgrades 179→201/191→201 e no checkpoint do
minuto real. E2E ainda em execução nesta leitura. Retenção e índices acima
ainda não fazem parte desse resultado. Journal candidato atual: 202; produção
conserva 191 recibos/0190 e nenhuma admissão de visitante está habilitada.

## Contexto candidato do anfitrião atual

A composição de contas → mundo → perfis pode consultar o namespace explícito
de visitas. Entradas legadas continuam presas ao namespace de membro; não
existe seletor de namespace na API. Compartilha-se a composição de identidade,
sem compartilhar recibos, aprovações ou efeito de participação.

Nova escrita positiva interna exige social/visitas habilitados, manifesto,
instância e SID com suporte persistido. Relê presença, SID, aparelho, conta,
cobertura e política do anfitrião pelo kernel existente. Usa a conta já
travada da composição, sem inferir autoridade do recibo técnico ou tomar nova
conta fora da ordem. Também confere membro permanente ativo, responsável ou
coadmin coerente, posse/cerca atuais, instância ativa e prazos da sessão e da
presença. Confere novamente o prazo após o callback; espera que o atravessa
reverte o efeito. Presença nova não substitui a identidade original do convite.

Nove integrações candidatas exercitam contexto positivo, separação de
namespace, fim de SID/aparelho/cobertura/posse/presença, nova presença, prazo
durante o efeito e modo desligado. Convites desses testes são fixtures SQL;
isso não representa envio, aprovações, aceite, concessão ou entrada de visita.
Os futuros serviços ainda precisam conferir amizade, conteúdo, revisões,
aprovações, prazo do convite e limites do mundo. Nenhum endpoint de visitante
foi publicado por este contexto.

Fundação `e30cdbc8` concluiu os oito gates `44230126377`, com 858 integrações,
upgrades com dados e checkpoint real aprovados. Retenção `566c1d3a` continua
em verificação no run `44231363456`. Esse resultado ainda não cobre os nove
testes e o contexto acrescentados depois dessas fontes.

Retenção `566c1d3a` concluiu os oito gates `44231363456`, com 864 integrações
e upgrades 179→202/191→202. Contexto `468008de` passou em 873 integrações e nos
sete gates fora de E2E; navegador ainda em execução na leitura deste registro.

## Emissão candidata de convites de visita

Serviço interno com corpo estrito: mundo, destinatário, presença original e
UUID de tentativa. O perfil de origem vem do autor autenticado. Nova emissão
revalida ambas as pontas, amizade, bloqueios, regras infantis/conteúdo,
permissão de convidar e anfitrião atual. Participante com política `yes` pode
convidar para visitar sem texto opaco de participação. `with_approval` conserva
pedido pendente sem decisão do mundo; `no` recusa. Nenhum desses fatos substitui
aprovação parental.

Membro atual/afastado/sem acesso não recebe visita para contornar o vínculo.
Ex-membro pode receber convite, mantendo a participação antiga como `former`.
Somente convite e eventual decisão automática do mundo são gravados, com
auditoria estrita; não se cria concessão, SID ou participação permanente.
Expiração é o menor prazo entre 24 horas e a janela original da presença, sem
alongar no replay. Recebimento/reentrada ainda exigirão todos os demais fatos.

Uma tentativa repetida recupera só recibo técnico próprio (IDs, jogo, estado,
datas), mesmo após fim da presença, bloqueio, perda de cobertura e modos
desligados, com identidade nativa atual. Não devolve presença, nomes ou prova
de autorização atual. Corpo divergente conflita. Outra chave para o mesmo
pedido pendente exige resolvê-lo antes. Teto de 20 tentativas/10 minutos por
origem, 64 pendências por mundo e 1000 recibos na união origem/destinatário.
São limites da fila, não número de jogadores admitidos.

Dezenove integrações candidatas cobrem amizade real, concorrência/replay,
recuperação gratuita reduzida, nonce divergente, bloqueio, políticas do mundo,
participação existente/ex-membro, rollback de auditoria/prazo, corpo estrito
e histórico retido sem apagar recibos para abrir espaço. Papéis/membros e
as mil linhas históricas são fixtures SQL explícitas; não alegam mil jogadores
ou homologação do fluxo de gestão. SDK/HTTP de visitas, aprovações, aceite,
admissão/runtime e interface continuam pendentes; serviço não exposto em rota.

Releitura da proposta privada `paginas/recreio.html` v2.2 confirma: visitas
não são membros, terminam com a saída do anfitrião ou em 24 h e exigem convite
novo para voltar. `membrosMax` deve ser medido; o teto de filas acima não é
prova de capacidade de jogo. Mantém-se a medição remota do F10/F11.

Contexto `468008de` concluiu os oito gates `44232334360`, com 873 integrações.
Emissão `fb75f103` passou nas 892 integrações/88 arquivos, cinco do Bastidores,
upgrades 179→202/191→202 e sete gates fora do navegador; E2E ainda em execução.

## Aprovações nativas candidatas

O mesmo coordenador nativo de identidade e travas atende os dois namespaces
por carregadores tipados separados. Chamadas antigas continuam consultando
somente convites de membro; não há campo de namespace aceito do navegador.
Aprovação de visita relê amizade, conteúdo, versões, responsável e anfitrião
atuais, com login nativo recente do decisor e confirmação explícita.

Decisão parental grava vínculo, geração de acesso e versão da política de
cada menor; a conta precisa ser sua responsável atual. Decisão do mundo grava
membro aprovador e revisão da gestão; se o mundo é cuidado por menor, o adulto
responsável decide com a própria conta, sem usar o aparelho infantil. Pagamento
não concede nenhum desses poderes. Decisor nativo não precisa de plano ou
perfil próprio de jogador; a presença do anfitrião continua exigindo cobertura.
Recuperação de prova exige igualdade atual e não atualiza silenciosamente uma
aprovação antiga. Alteração relevante exige convite novo.

Doze integrações candidatas cobrem gestor sem plano, replay/auditoria únicos,
destinatário sem gestão, login/gestão/anfitrião perdidos, responsável sem
jogador nem plano, decisões parental e de mundo independentes, gestão de
mundo infantil, adulto alheio, versão/consentimento divergentes e dois
rollbacks de auditoria. Amizade e aprovação social usam os serviços reais;
papéis de gestão no mundo são fixtures SQL explícitas. Ainda sem concessão,
entrada de visitante, interface ou rota pública. Gates desta candidata pendentes.

Aprovações `42900ed9` concluíram os oito gates `44235115992`; emissão anterior
`fb75f103` também concluiu os oito gates `44233704383`. A próxima candidata
acrescenta aceite/concessão e redução, sem admissão de jogo.

## Concessão e redução candidatas

Aceite pertence ao destinatário atual, com cobertura de jogo, amizade,
conteúdo, versões/gerações, decisões de mundo e de cada menor relidas junto
do anfitrião/posse atuais. Cria `world_visits`, conserva prazo e presença
originais e não cria membro ou SID. Uma concessão ativa por visitante/mundo;
outra precisa ser encerrada antes. Vencida é expirada com evento estrito antes
de nova concessão, na mesma transação. Aceite, concessão e auditoria revertem
juntos se qualquer prova vencer ou a auditoria falhar.

Provas parentais/de mundo usam o mesmo validador tipado dos convites de membro,
com tabelas separadas; só a visita permite decisão direta de membro com
`membersInvite=yes` sem participação opaca. O validador de visita também
admite estado aceito para a futura revalidação contínua, sem mudar o leitor
legado de membros. Retorno do aceite é recibo, sem token ou promessa de entrada.

Revogação pela origem, recusa/saída pelo destinatário e redução do responsável
atual por seu menor não exigem plano, amizade, presença da outra ponta ou modo
habilitado. Não tomam autoridade da outra família. Conservam o fato de aceite
e encerram só a concessão própria; até mundo excluído logicamente permite essa
redução. Não encerram o anfitrião nem uma partida da pessoa em outro mundo.
Repetição recupera o fato anterior, sem alongar/reabrir. Leitor mantém trava no
recibo para não observar metade de expurgo; aceite sem concessão é falha
operacional explícita, sem fabricar dados para dizer que houve sucesso.

Vinte integrações candidatas cobrem concorrência/replay, protocolo legado
recusando visitante, decisões/cobertura independentes, prova de gestão/política/
aprovação/presença/bloqueio atual, destinatário correto, concessão anterior,
redução gratuita, partida alheia preservada, proteção parental, expiração no
commit, dois rollbacks de auditoria, inconsistência explícita, mundo excluído
e ex-membro sem restauração. Role/histórico/inconsistência são fixtures SQL
identificadas; não comprovam o fluxo de exclusão F7. SDK/HTTP, ponte de SID de
visitante, abertura/renovação/checkpoint/encerramento na instância e interface
ainda pendentes. Nenhuma visita de jogo é admitida por este incremento.

Concessão `79202b31` concluiu os oito gates `44237514615`, com 924 integrações
em 88 arquivos, cinco do Bastidores e upgrades 179→202/191→202 preservados.

## Ponte de sessão em implementação

Cada SID visitante declara uma única finalidade antes de receber token e
margem de salvamento. `world_visit_sessions` distingue intenção preparada,
admissão atual de curta duração e encerramento. Uma visita conserva vários
SIDs históricos, mas no máximo um admitido; troca de aparelho precisa da
prova durável de checkpoint e do ingresso que abriu o sucessor. Saber o ID
da visita ou criar uma intenção não concede entrada nem cria membro.

Fundação aditiva, sem alteração de linhas antigas ou capacidade do Morada.
Geração da migration, restrições em PostgreSQL e integração do protocolo
continuam pendentes. A retenção deve remover os vínculos antes da concessão,
sem apagar SID ou declarar um salvamento inexistente.

Gerada no GitHub em `44239815576`, fonte `f4e875e3`, artefato `14398997670`:
0202 `lively_nick_fury`, 4045 bytes,
SHA-256 `bb21778799b1f7c49ac73c4e7d928d464261dc6277a6cf40fdf263312e21ed06`.
ZIP `ff2906c86141bb031964c6f89c368eb3a7891405437d498de4f4058b03ebd86b`;
proveniência, três caminhos, bytes/SHA, prefixo dos 202 recibos e predecessor
do snapshot conferidos antes da cópia. DDL contém só a tabela, suas FKs,
restrições e índices; nomes curtos, sem backfill ou aplicação em produção.

A candidata fixa `visitaId` antes de emitir o primeiro token e a margem de
salvamento: ambos respeitam a janela original da concessão. Recuperação não
omite/troca finalidade, e renovação não amplia seu prazo. Preparação relê
somente restrições da própria sessão; não toma travas da outra família ou
admite entrada no mundo. Admissão completa pertence à API da instância.
Um SID preparado/encerrado não passa pelo leitor de membro, mesmo após uma
mudança de papel. Até 128 intenções históricas por visita limitam o abuso de
aberturas, sem apagar recibos nem prometer capacidade simultânea.

Retenção mantém raiz/concessão/vínculos enquanto algum SID vinculado está
aberto; após encerramento real, remove vínculos antes da concessão e raiz,
atomicamente com a auditoria. Não apaga SID ou prova de salvamento. Integrações
candidatas cobrem o protocolo real de abertura/renovação e fixtures explícitas
para restrições/retencão; gates pendentes. Entrada, troca entre SIDs com prova
de checkpoint, runtime, interface e ativação continuam abertos.

Sessão `4f4a772e` passou nas 947 integrações/89 arquivos, cinco do Bastidores,
upgrades 179→203/191→203 e sete gates fora do navegador (`44240677665`).
E2E ainda não concluído na conferência deste registro.

## Admissão e checkpoint candidatos

`POST /api/sdk/v1/visitas/abrir` confere o SID com finalidade de visita e
orienta somente à instância/posse originais. Não aloca instância, reatribui
cerca, admite SID ou devolve membro/papel. A API autenticada da instância
`/mundos/{id}/visitas/entrada` compõe contas → mundo → perfis, relê amizade,
versões, aprovações, cobertura das duas pontas, presença/SID do anfitrião,
posse e finalidade do visitante. Admissão vincula o SID a esse mundo e emite
permissão de até 30 segundos, limitada por todas as concessões envolvidas.
Reconexão do mesmo SID repete o vínculo; não renova sessão ou janela da visita.

Membros e visitantes disputam o mesmo teto de SIDs em `jogadoresSimultaneosMax`.
Visitas exigem o teto declarado e válido no manifesto; leitores de membro
também o aplicam sob a trava do mundo. O valor oito é somente orçamento da
fixture interna; não comprova carga, hardware ou capacidade de um jogo público.
Morada continua sem `visitas`, sem alteração de catálogo/pin de produção.

Sucessor precisa do checkpoint F3 confirmado, fotografia posterior com hash,
ingresso consumido para aquele SID/aparelho e antecessor realmente encerrado
como `replaced`, no mesmo mundo/cerca/política/concessão. Conserva as duas
linhas e um único vínculo ativo; saída comum não é prova de continuidade.
Checkpoint e salvamento de saída aceitam somente admissão anterior daquele
SID/mundo, inclusive após perda da visita; intenção preparada não autoriza
salvar mundo. Esse leitor só reduz/conclui a sessão e não concede gameplay.

Integrações candidatas usam rotas, transporte real, concorrência, decisões
atuais, capacidade compartilhada, rollback de auditoria, salvamento após
revogação e troca real com fotografia/checkpoint. Papéis de membros no ensaio
de orçamento são fixtures SQL; não é medição F10 ou homologação humana.
Testes do transporte recusam resposta de membro, concessão divergente e rede
perdida sem repetição automática. Gates pendentes desta candidata.

Ainda faltam heartbeat em lote de visitantes, encerramento técnico com cursor,
integração no SDK/runtime/interface, jornadas familiares e homologação remota.
Nenhuma visita foi habilitada em produção e F5/F6–F11 continuam abertos.

### Correção do coletor de controle E2E

A rodada `44240677665` terminou com sete gates aprovados e falha no navegador:
37 E2E passaram; `familia-cadastro` capturou uma resposta de controle e deixou
para ler seu corpo depois da navegação (`Network.getResponseBody: No data found`).
A candidata passa a identificar o controle pelo token da abertura nova e ler
os dois corpos imediatamente nos respectivos eventos. Conserva a prova da
pausa real informada pelo servidor, incluindo virada do dia; não muda relógio,
limite, tentativas ou comportamento do produto. Nova qualificação necessária.
