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
