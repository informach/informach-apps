# Recreio: gestão e visitas de mundos

Plano de F5, autorizado pelo fechamento da plataforma. Fonte de requisitos:
`artes-3d/paginas/recreio.html` v2.2 e
[fechamento web](fechamento-plataforma-2026-11-16.md). Não declara entrega.

## Contratos

- Responsável nomeia ou retira coadministrador adulto, com login próprio
  recente. Coadministrar não transfere responsabilidade nem cobertura comercial.
  Menor, aparelho pareado, pagante sem participação e ex-membro não recebem
  poderes por consequência de compra ou parentesco.
- A configuração de convites do mundo tem três opções: não, com aprovação
  (padrão) e sim. Responsável/coadministrador aprovam convites de membros.
  Convite direto de membro limita-se à participação já atribuída a ele ou à
  visita. Não aceitar texto arbitrário como prova de que a família é dele.
- Convite dirigido exige destinatário conhecido, amizade atual autorizada e
  ausência de bloqueio nas duas pontas. Proteção infantil exige aprovação atual
  do responsável nativo; aprovação do mundo e aprovação parental são fatos
  distintos. Um aceite relê todas as autorizações e a política de conteúdo.
- Visita é uma concessão separada de participação. Tem prazo máximo de 24 horas,
  anfitrião explicitamente vinculado e revogação. Sair o anfitrião encerra a
  visita; retomá-la exige convite novo. Nunca fabricar `SpaceMember` temporário
  para enganar as regras atuais. Jogo precisa negociar suporte à entrada de
  visitante; cliente antigo continua no protocolo de membro existente.
- Arquivar preserva membros, diário, fotografias e autoria. Exige partida e
  posse encerradas com os recibos existentes; não fabricar ACK, terminar jogo
  com escrita pendente ou reinicializar contador de cerca. Retomar conserva IDs
  e conteúdo. Perder assinatura não apaga mundo nem concede administração.
- Participantes podem bloquear, silenciar e denunciar outro participante sem
  amizade. O servidor captura somente a referência da coparticipação autorizada,
  sem conteúdo do jogo. Bloquear impede novos convites/visitas entre as pontas;
  não expulsa automaticamente membro permanente nem apaga progresso alheio.

## Execução em incrementos

1. Gestão nativa: revisão de gestão distinta de fotografia/cerca, contexto
   atual sob travas, nomeação/retirada de coadministrador, política de convites,
   arquivar/retomar, auditoria atômica e leitura sem exigir plano.
2. Convites dirigidos: recibo idempotente, decisões de mundo e responsáveis,
   expiração/revogação e releitura no aceite. Preservar convites adultos legados
   em prazo; não reinterpretá-los como convite infantil aprovado.
3. Visitas: tabela e identidade próprias, capacidade negociada de SDK/host,
   entrada/renovação com prazo e anfitrião atual, revogação/limpeza e prova num
   servidor interno. A plataforma não depende da evolução D3–D8 do Morada.
4. Superfície de participantes: listagem mínima autorizada, presença sem
   localização pública, proteção/denúncia sem amizade e aplicação dos bloqueios
   às novas concessões de mundo.
5. Jornadas: dois adultos, coadmin, membro, menor e responsável sem jogador;
   recusas por HTTP, concorrência com saída/remoção/transferência, expiração,
   resposta perdida, auditoria recusada, restauração e upgrade com dados.

Migrations aditivas geradas no GitHub e conferidas por origem/bytes/hash. Não
editar SQL/snapshot/journal. Gates e builds pesados exclusivamente no GitHub.
Nenhum incremento habilita famílias ou venda por conta própria. A implantação
continua exigindo fonte/configuração real, compatibilidade de todos os
consumidores e os demais aceites F1–F11.

## Candidata de fundação

`3fb90a5e` gerou a migration 0191 no GitHub, run `44183203749`, artefato
`14371724208`. ZIP SHA-256
`32a710b419765f7479505608aba2d6981b39488b7114348634d4a5dd215983a3`.
Três arquivos conferidos por origem, tamanho e hash e copiados intactos:

- SQL `0191_ordinary_xorn.sql`: 359 bytes,
  `759ed5f5d0a5b6d0838826d5a0b1f69fc24aeb2f72f760a5fa8839facd4acea5`.
- Snapshot: 853268 bytes,
  `9ed2039fbfeea2866b48a6a87e44bce703a01727ab37fe64a87e9685644b14f3`.
- Journal: 29047 bytes,
  `ff2454586bea485681bce3929ea3c030f9640e84e2315b367309a1843ec6ff15`.

Apenas duas colunas aditivas e check de revisão positiva. Não muda revisões
de fotos/cercas ou inventa data para arquivo legado. Produção continua com
184 recibos; esta candidata exige 192, incluindo as migrations F4 ainda privadas.

O backend candidato usa conta/login nativo atual, perfil próprio adulto,
participação e responsabilidade atuais, login recente e CAS da gestão.
Trocar o papel encerra somente as partidas do perfil naquele mundo. Arquivar
recusa SID ou posse não encerrados, preserva bytes e vínculos, revoga convites
com auditoria e não fabrica checkpoint. Retomar conserva a cerca crescente.
Transferência aceita também incrementa a revisão de gestão.

A revisão encontrou a ordem perfil → mundo em quatro fluxos antigos.
Leitores de responsabilidade/membros, saída e transferência passam a tomar o
mundo antes de perfil/aparelho, conservando suas revalidações. Quatro testes
seguram a linha do mundo, observam o bloqueio por `pg_blocking_pids` e exigem
que um `FOR UPDATE NOWAIT` no perfil continue disponível. Outros ensaios cobrem
CAS concorrente, papel infantil, aparelho pareado, login encerrado/antigo,
rollback real de auditoria e ciclo de fotografia/posse por HTTP.

Ainda não verificados remotamente neste registro. Leitura e telas nativas,
convites dirigidos/aprovações, visitas e proteção de participantes continuam
por concluir. Não publicar essa fonte como F4 pronta nem migrar automaticamente
estas tabelas com base em gates de uma candidata anterior.

`d1c2c433` em `44187554835` aprovou integração: **727 testes/79 arquivos**,
incluindo as doze provas da gestão e ordem de travas, cinco provas de projeção
do Bastidores e atualização **179→192**, com dois perfis, progresso e conquistas
preservados e repetição sem mudança. Qualidade/builds recusaram o evento novo
ausente na união `AuditEventType`; a candidata seguinte registra o tipo fechado.
Não transformar a integração isolada em aprovação de todos os gates.

A candidata de interface acrescenta `/conta/mundos/[id]/gestao`, acesso pelos
vínculos e pelo mundo, coadmin em leitura, confirmação da consequência e um
envio por revisão. Falha de resposta exige leitura nova; não há reenvio
automático. Consulta não pede login recente ou cobertura, escrita conserva as
exigências. A estante e o mundo arquivado deixam de oferecer “Jogar” ou novo
código de convite; o servidor já recusava a entrada. Uma jornada candidata
nomeia coadmin, confere leitura sem poder de mudança, arquiva, confere a estante
e retoma com os mesmos participantes. Captura mobile ainda por validar.

Este incremento atende à gestão nativa do próprio perfil adulto. Gestão pelo
responsável de um mundo criado por menor continua pendente, distinta de dar
coadmin a um menor, que permanece recusado. Convites dirigidos/aprovações,
visitas, proteção de participantes, operação e homologação integral continuam
abertos. Produção permanece na fonte e nos 184 recibos de F1.

A candidata seguinte estende a gestão ao responsável atual de um perfil menor,
sem exigir jogador próprio. A identidade nativa do adulto fica separada do
perfil gerido; grupo comercial não basta e o aparelho infantil não recebe essa
autoridade. A gestão só alcança mundos em que o menor é responsável, não os
mundos de terceiros em que ele participa. Lista paginada e rotas sob
`/conta/perfis/[id]/mundos` revalidam o vínculo, e o evento registra o adulto
como ator. Três integrações candidatas cobrem essas fronteiras; uma jornada
real de pareamento/criação no título interno Livre exercita arquivo/retomada
pelo responsável sem jogador. Não muda a classificação do Morada.

Transferência da responsabilidade de mundo de menor para outro adulto ainda
precisa de um fluxo de proposta com proveniência do responsável e aceite do
destinatário; o fluxo adulto anterior não é reinterpretado como essa prova.
Encerramento F7 continua dependendo dessa resolução. Convites, visitas,
participantes e os demais gates F5 também permanecem abertos.

O próximo incremento cobre proteção entre participantes sem amizade. O servidor
descobre e trava um mundo comum antes dos perfis, relê as duas participações e
registra apenas a referência opaca dessa coparticipação. Não recebe evidência
ou conteúdo do navegador. O check de denúncias ganha a alternativa `mundo`, sem
alterar evidências anteriores; sua migration será gerada e conferida no GitHub.
Bloqueio não expulsa membro nem apaga progresso. A listagem exige a autoridade
atual do mundo e não transforma esse vínculo em amizade ou presença pública.

`2f577567` passou nos oito gates `44189574384`, incluindo a gestão adulta no
navegador. `84204b1c` passou nos sete outros gates, mas sua jornada infantil
falhou ao tentar usar a estante adulta: a estante protegida não oferecia criação
de mundos. O corretivo candidato inclui criação com a identidade restrita do
aparelho, retorno a `/aparelho` e nomes sem link para a página adulta. Conserva
classificação, cobertura, política, limites e auditoria no serviço existente.
O teste continua exigindo criação real no título interno Livre, sem fabricar
mundo no banco para anunciar essa jornada.

A migration 0192 foi gerada em `44193535906`, origem
`825c49c48976f165e77a37310f3179afdd424e46`, artefato `14377348257`.
ZIP SHA-256 `bbdd2c86e94d94f4693165e754e69adfff04bd20be969742a8943fd02cffbd13`.
Somente o check de evidência é ampliado, preservando todas as alternativas
anteriores. Os três arquivos foram conferidos e copiados intactos:

- SQL `0192_peaceful_kitty_pryde.sql`, 789 bytes,
  `cb91e1af07b9795dcfaca25b4fbb2f83f66b3d65bbea45ef6ee90f955f401bce`.
- Snapshot, 853281 bytes,
  `64fdca8df7cf003a4e6abc891b98db5585bd2928dbe8599fa3e862ed8e3d59a2`.
- Journal, 29197 bytes,
  `a6436180b8125f7daed1c823f298eaa82d6251982555e53101142ec4180c5a38`.

A candidata oferece `/participantes/[id]` para jogador nativo ou pareado e
`social.participantes` no SDK, com dez registros, cursor, sem presença, conta,
papéis administrativos ou conteúdo. A consulta nativa e a proteção não exigem
assinatura; o SDK conserva SID e jogo atuais. As duas pontas bloqueadas têm
identificação reservada. O host lista os participantes que ainda não aparecem
nos contatos e oferece os mesmos cuidados dentro do diálogo. Convites adultos
anteriores passam a recusar bloqueio atual em qualquer ponta, sem consumir o
código. Dez integrações novas cobrem essas regras, escopo HTTP, revisão de
proteção, atores nativo/infantil, rollback de auditoria e espera real da trava
do mundo antes dos perfis. A nova jornada de navegador conserva o jogo e os
membros após a proteção. Gates desta candidata ainda pendentes; produção não
recebeu 0191/0192, convites dirigidos/aprovações e visitas continuam abertos.

Na primeira rodada `44195791990`, 740 integrações passaram; uma precondição do
teste de escopo tentou criar o segundo jogo que só existe no mock de outros
arquivos. O corretivo prepara explicitamente os metadados de outro jogo e sua
participação para provar a recusa do SID de Morada, sem mudar o catálogo ou a
regra do servidor. A rodada seguinte deve executar a mesma recusa HTTP.

A próxima candidata completa a consulta nativa do responsável sem jogador em
todos os mundos em que o menor continua participante. Só o mundo cujo
responsável é o perfil recebe “Gerenciar”; os demais oferecem proteção. A
leitura trava o mundo antes do perfil e revalida a conta nativa e o vínculo
parental. Ações usam o adulto real e autenticação recente, sem autoridade do
aparelho infantil. Participações `no_access`/`away` conservam proteção gratuita;
`former` não cria uma nova prova de coparticipação. O SDK continua exigindo a
partida autorizada. As regressões conservam a recusa da gestão de terceiros e
acrescentam a consulta por responsável atual/recusa de outro adulto. A jornada
infantil passa pela consulta nativa, ainda sem outros participantes até os
convites dirigidos estarem homologados.

O próximo incremento tem [plano de convites dirigidos](convites-dirigidos-2026-11-17.md).
A fundação adiciona tabelas próprias e uma chave composta de proveniência do
emissor, sem reescrever os códigos anteriores. Gerar e conferir a migration no
GitHub antes da implementação e dos gates desse incremento. A candidata de
participantes fica congelada em `a59e1923` para sua qualificação independente.

Qualificação encerrada: `080eee4e` passou nos oito gates `44196661859`, com a
recusa HTTP de outro jogo preservada. A fonte `a59e1923` acrescentou consulta
parental gratuita em todos os mundos atuais do menor e passou nos oito gates
`44197543292`. A rodada E2E anterior `44195791990` já passou nas jornadas novas;
as três capturas de 390 px foram inspecionadas no artefato `14380655476`, ZIP
`b512f1fe310bca5dcd6ad71ff1b435255c29cc70d02c8ee1fa5a3847ab75a40b`.
Gestão adulta, gestão por responsável sem jogador e proteção de participante
sem amizade ficam legíveis. Isso não comprova implantação ou fechamento de F5.
O backend de convites dirigidos segue em candidata própria, sem rotas públicas,
e exige os demais aceites do plano vinculado acima.
