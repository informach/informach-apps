# Recreio: adultos convidados e cobertura explícita

**Objetivo:** concluir os aceites de F1 para grupo comercial sem alterar a
identidade de jogador, a responsabilidade por menores ou as permissões de mundos.
Plano de implementação em série; nenhuma função deste registro está homologada.

**Arquitetura:** reutilizar `recreio.groups`, `profiles.group_id` e
`coverage_enabled`. Um perfil conserva seu ID ao entrar ou sair. Conta nativa
administra o próprio contrato, mesmo sem jogador; o convidado usa seu login e
não recebe administração. Assinaturas/concessões são lidas somente por
`features/acesso`. Não usar organizations nem integrar a carteira Compasso.

**Tecnologias:** versões atuais de Next/React, Drizzle/PostgreSQL 18, Better
Auth e Zod do lockfile. Sem atualização de dependências.

**Especificação:** `artes-3d/paginas/recreio.html` v2.2, seções de identidade,
grupo e saída; decisões vigentes em
[fechamento da plataforma](fechamento-plataforma-2026-11-16.md).

## Contratos e limites

- A cobertura Individual comporta um jogador e Família até quatro. O pagante
  pode ser exclusivamente administrador; não criar jogador para convidar.
- Um perfil possui no máximo um grupo comercial. Entrar em outra família exige
  sair da anterior explicitamente; nunca substituir cobertura de terceiro por
  uma aceitação implícita. Contrato pago próprio não é cancelado ao aceitar.
- O titular pode retirar cobertura, mas não editar o perfil adulto convidado,
  seus mundos, progresso, amigos ou políticas. Responsabilidade infantil continua
  no vínculo explícito e não acompanha um convite de adulto.
- Saída conserva perfil e dados; sem cobertura, não abre jogo. Não transferir
  automaticamente para o plano próprio nem criar nova identidade para continuar.
- Convite exige sessão nativa recente do titular, destinatário por e-mail e
  aceite pela própria conta com endereço comprovado. Declaração adulta explícita,
  sem recibo de verificação externa. Nunca indicar se o endereço já tem conta.
- Identificador aleatório do convite não concede autoridade: leitura/aceite
  exigem sempre a conta destinatária. Não criar links públicos com Bearer nem
  publicar e-mails em auditoria, Sentry ou catálogo. Endereço é dado privado
  transitório, apagado ao encerrar/vencer o convite; recibo guarda somente IDs.
- Aceite, saída e retirada sobem a revisão do perfil e encerram sessões antigas
  atomicamente. Isso é revogação, sem exceção de salvamento final. Não apagar
  credenciais ou tornar acessos antigos válidos novamente.

## 1. Composição e cobertura atuais

- [ ] Mapear escritores atuais em `features/perfis/repository.ts`,
  `familia/repository.ts`, scripts de concessão/revogação e kernel de autoridade.
  Registrar ordem de travas antes de introduzir um escritor de composição.
- [ ] Criar `features/grupo/autoridade-repository.ts`: descobrir os participantes
  somente como pista, tomar os mutexes nativos das contas em ordem estável,
  autorizar o ator, travar grupos/perfis e reler todos os vínculos. Divergência
  da pista recusa a operação; não continuar com uma lista de travas incompleta.
  Aceite admite origem própria ou nenhuma; não atravessa terceiro grupo.
- [ ] Extrair de `features/acesso` um leitor de capacidade do grupo, com a mesma
  decisão comercial e conexão da transação. Não duplicar consultas financeiras
  ou decidir pelo valor/preço no escritor de grupo.
- [ ] Implementar leitura de composição com projeção mínima e autorização:
  titular vê jogadores cobertos e convites que emitiu; adulto vê apenas seu
  vínculo. Nem titular nem convidado recebem conteúdo de outros perfis.
- [ ] Implementar seleção explícita de cobertura, retirada e saída. Validar
  conjunto esperado e limite atual sob trava, impedir mudança silenciosa de
  outra tela; permitir saída sem plano vigente. Preservar a limitação existente
  de quatro cadastros e distinguir cadastro de cobertura na interface.
- [ ] Provar em PostgreSQL descartável: titular sem jogador, Individual infantil,
  Família com quatro, quinto recusado, conta estrangeira/contexto infantil
  recusados, alteração concorrente, plano perdido durante espera, rollback da
  auditoria e revogação efetiva de sessão/capacidade anterior.

## 2. Convite e aceite

- [ ] Acrescentar schema dedicado `recreio-group-invites.ts`, exportação e tipos
  de auditoria. Prazo de 72 horas, no máximo cinco pendências por grupo, um
  convite pendente por grupo/endereço, recibo terminal idempotente. Normalizar
  endereço conforme autenticação; registrar somente IDs na auditoria.
- [ ] Gerar migration/snapshot/journal no workflow `db-generate.yml`; inspecionar
  bytes e hashes do artefato. Não editar SQL gerado. Testar migração do banco
  anterior e constraints antes de qualquer operação real.
- [ ] Criar `features/grupo/convites-repository.ts` e `service.ts`: convidar,
  listar entradas autorizadas, revogar, aceitar com declaração e revalidar
  prazo/capacidade/identidade após esperas e auditoria. Resposta perdida repete
  o mesmo aceite, sem segundo perfil, nova cobertura ou autoridade adicional.
- [ ] Provar destinatário incorreto, endereço alterado, prazo vencido durante
  espera, convite revogado, duplicação, aceite simultâneo em dois grupos,
  disputa pela última vaga, contexto pareado e ausência de declaração. Exigir
  igualdade de perfil, progresso, conquistas e participações antes/depois.
- [ ] Expurgar endereço em convites terminais/vencidos e recibos técnicos em
  lote delimitado com `SKIP LOCKED`. Integrar contagens no cron e futuras
  exportação/exclusão de F7. Não usar a limpeza como autorização para sair.

## 3. Fluxo utilizável e implantação

- [ ] Compor `/conta/grupo`, entrada de convites e gestão de cobertura em React;
  ações usam autoridade nativa recente e limites por conta. Mostrar claramente
  que cobrança própria continua e que entrar não compartilha dados ou mundos.
  Convites são apresentados dentro da conta autenticada; não enviar mensagens
  operacionais a pessoas para simular a homologação.
- [ ] Navegador real no GitHub: titular sem perfil convida adulto com perfil
  existente, destinatário aceita pelo próprio login, mantém progresso e joga;
  não acessa cobrança/supervisão alheia. Sai e volta a ter acesso apenas depois
  de cobertura própria explícita. Cobrir dois adultos e quatro jogadores.
- [ ] Executar gates completos do Recreio e CI compartilhado para schema/auth/
  contratos, revisar evidência e diferenças. Testes/build/carga só no GitHub.
- [ ] Fazer backup/restauração atual, migrator sem seeds com fonte qualificada,
  integração limitada na main pública e verificação de SHA/migrations/ready/
  alertas no Railway. Conservar flags desligadas até os demais aceites de
  famílias, privacidade, operação e classificação de título.

F3 restrito continua em qualificação independente. Este plano não entra na sua
fonte funcional nem autoriza publicar migrations futuras junto de 0177/0178.

## Primeiro incremento em implementação

Fonte isolada de F3: extrair a decisão comercial pura sem perfil fictício e o
carregador de fatos do grupo em `features/acesso`. O caminho de jogador conserva
suas negativas de suspensão/cobertura e acrescenta sua revisão à mesma decisão
comercial. Não há escritor, rota, convite ou ativação por esta extração.
As provas exigem pagante sem jogador, limites 1/4, revogação, conexão da
transação e ausência de autoridade para um perfil sem cobertura. Gates remotos
ainda necessários; este incremento não conclui o fluxo de F1.

Segundo incremento em implementação: `features/grupo` compõe admissão nativa,
revisão da lista e seleção explícita. Os mutexes nativos de titular, jogadores
adultos e responsáveis precedem as contas e os perfis; a composição lida como
pista é conferida novamente. Grupos recíprocos não podem inverter as travas de
seus jogadores. Capacidade é conferida de novo após auditoria; retirar cobertura
permanece possível sem plano e com a flag desligada. Novas ativações exigem a
flag familiar e vagas atuais. Nenhuma identidade/conteúdo é transferida.

As provas candidatas incluem titular sem jogador escolhendo um menor no
Individual, duas seleções disputando a vaga, grupo estrangeiro, contexto
infantil, login antigo, suspensão de tokens, rollback da auditoria, vencimento
do prazo durante auditoria e dois grupos recíprocos. Não há rota ou tela nova,
convite, aceite ou saída neste incremento. F1 e a ativação continuam pendentes.

A fonte `2e37353` passou nos sete gates `44086567561` para o carregador/decisão
sem perfil fictício. Em `1030c63`/`44087921047`, integração e qualidade já
passaram; a rodada completa do escritor ainda está em curso. Não publicado.

O terceiro incremento compõe `/conta/grupo`, ação nativa e seleção com aviso de
encerramento, confirmação explícita, limite atual e retorno para autenticação
recente. A jornada candidata cria dois menores sem jogador administrativo,
escolhe e troca a vaga Individual, recarrega cada confirmação e confere que os
IDs dos menores continuam iguais. Inclui captura a 390 px e recusa de seleção
acima do limite. Nenhuma leitura de dados dos jogos ou acesso ao financeiro do
outro adulto é acrescentado pela tela. Gates e inspeção visual ainda pendentes.

Modelo de convites em preparação: tabela aditiva, destinatário pendente por
endereço normalizado, 72 horas, endereço removido ao encerrar e recibo com
declarações adultas próprias desta operação. Não reutilizar a declaração de
responsabilidade por um menor para aceitar um adulto. FK composta liga emissor
ao titular do grupo e aceite ao par perfil/login; apagar o perfil retira o par
do recibo sem permitir que uma conta nova repita o aceite antigo.
Unicidades compostas das tabelas existentes são redundantes com seus IDs
primários, necessárias às FKs e não exigem normalização. Gerar e revisar a
migration remotamente; não aplicar junto do salvamento. Writers, limpeza e
fluxos de convite ainda não implementados.

Revisão da primeira geração (`44089860855`, fonte `70f1944`): o SQL criou as
FKs compostas antes das unicidades referenciadas nas tabelas existentes. A
ordem é inválida em PostgreSQL; artefato `14331216640` rejeitado, não copiado
nem aplicado. Não corrigir SQL gerado à mão. Separar a geração das unicidades
prévias (0179) da nova tabela e FKs (0180); conferir ambas no banco descartável.
O arquivo de schema da tabela retorna somente depois da migration prévia,
conservado na fonte `70f1944`. Nenhuma mudança de produção por esta correção.

`1030c63` concluiu os sete gates `44087921047`, com 531 integrações/49 arquivos.
Na tela `bffdc28`/`44089280856`, seis gates passaram e o E2E novo encontrou
também o anunciador vazio de rotas do Next ao procurar um `alert` genérico.
O aviso correto estava presente. Delimitar pelo texto exato, conservando o papel
acessível e todas as verificações de bloqueio/recarregamento. Não alterar o
anunciador ou o produto para acomodar a fixture; nova rodada completa pendente.

Pré-requisito gerado em `44090428312`, fonte `37434fba`: 0179 contém somente
as duas unicidades. Artefato `14330699266`, ZIP SHA
`4dc403b7e0e951e09e19dd8e68af5059f6678cc761d6ac818f6277eea49e08a0`.
SQL `0179_sudden_stranger.sql`, 235 bytes, SHA
`d6667f8379cc602caf6ee1844034b42e3ab589b6eb066a7501ff1ef733b787fc`.
Snapshot SHA `48cca0454072f3686f9cdfb17f0d0d8482df8203739278c6ad53a688392a5808`;
journal SHA `8656d6f46b8d63cba49122211caa0cfb9a98084b7088638abf4948038cceab91`.
Copiar os três arquivos intactos; restaurar o schema da tabela para gerar
0180 depois desse snapshot. As duas migrations de F1 continuam privadas.

Tabela gerada em `44091007394`, fonte `07ea6ca6`, depois do snapshot 0179:
artefato `14330589838`, ZIP SHA
`4329a6ed590ad6ce2f576e2f682b46ca3e5d80d7c8a34aafadf81b840abfccac`.
SQL `0180_romantic_veda.sql`, 4.709 bytes, SHA
`795584955c1e84908586271fb0c3e623963367ea8f658499c6258daa6cfc0ac7`;
snapshot SHA `a5693e704c975ba77308066b6aa0a202078b394a15c86ceb11a8b9b8c601a1dd`;
journal SHA `0826fe1610385508b6774ad4ae6833b83beff5e83be23fe46a3500082acfa849`.
Os três arquivos foram conferidos e copiados intactos. O SQL contém a tabela,
checks, FKs e índices novos; os alvos únicos já existem pela migration prévia.
Provas de banco candidatas exigem par perfil/login, emissor/titular, datas
terminais não nulas, endereço apagado e descarte atômico do par ao excluir perfil.
Nada aplicado; convite utilizável e aceite ainda pendentes.

Emissão de convite em candidata: titular nativo recente, declaração específica,
grupo criado junto do primeiro convite sem criar jogador, normalização do
destinatário sem consultar existência da conta, cinco pendências por grupo e
vinte por endereço entre grupos. Mutex de destinatário serializa a última vaga;
duplicação conserva ID/prazo. Mudança da pista de grupo vazio recomeça uma vez
depois do rollback, com todos os mutexes descobertos na ordem correta. Auditoria
e expiração que retira endereço são atômicas. Sem envio de e-mails operacionais.
Listagem, revogação, aceite, limpeza global e telas de convite ainda pendentes.

Na fonte `7a719f3`/`44091431827`, os seis gates sem E2E geral passaram,
incluindo migração ordenada/constraints. A jornada da tela confirmou e
recarregou as duas seleções; falhou ao ler links antes de concluir a navegação
cliente de volta aos perfis. A fixture agora espera URL e exatamente dois links
antes de comparar IDs. Sem espera arbitrária e sem mudar o produto. O capture
de 390 px já foi produzido; inspeção e nova rodada ainda necessárias.

Revisão de privacidade antes do aceite: quando o destinatário já possui conta,
fixar também seu ID na emissão. Reutilizar um endereço após troca/exclusão não
pode revelar nem aceitar um convite dirigido à conta anterior. Nova coluna
nullable e FK aditivas em geração própria (0181); dados reais não existem aqui.
Conta excluída elimina sua pendência; recibos terminais retiram a vinculação.
O endereço continua exigido junto do ID, e a resposta de emissão não informa
se a conta existe. Leitores/aceite precisam provar a troca de endereço. A
captura de cobertura entra na lista explícita de telas sintéticas do workflow;
o artefato anterior de conta não a incluía. Inspeção visual continua pendente.

0181 gerada em `44094044162`, fonte `b015c4f0`, artefato `14333575954`:
ZIP SHA `40b99d7ca31c026b30d178640b9a0b581142199d58f7212acb0575293bac9918`.
`0181_old_plazm.sql`, 520 bytes, SHA
`000b6c5c98b2164ccec77fd3aaab64b42085c78fb7fab064549844496de31a17`;
snapshot SHA `9367b60e76f486ae903946eca13a19aa5625a1e103bf88763218953516a8fd1d`;
journal SHA `3f1821a8c6abeeee4c0fbddea7aa632405979a5eed54ac88eab175c296ffb1a3`.
Três arquivos conferidos e copiados intactos. Somente coluna nullable, FK e
check da tabela privada de convites; não toca concessões, identidades ou dados.

`6f5a555` passou nos sete gates `44094451952`, com 545 integrações/51 arquivos;
CI compartilhado `44096609191` em execução. Captura de cobertura a 390 px
inspecionada no artefato `14334081597`, SHA
`084d71b0f4309a28b16d165ce4f1cb227ce6debdc73223673d62dba0d5571910`:
texto legível, estado atual separado da seleção e sem rolagem horizontal.
Produção conserva somente F3 em `3f2b1239`, como documentado na main `338236d`.

Nova candidata de leitura e encerramento usa e-mail atual da conta travada e
o ID fixado na emissão. Outro dono do endereço não recebe a pendência antiga;
sem conta na emissão, o novo acesso verificado pode recebê-la. Contexto infantil
não lê/encerra convites. Emissor revoga e destinatário recusa com login recente;
ambos retiram endereço/vinculação atomicamente e auditam sem conteúdo. Leituras
têm limites de lock/transação e não retornam dados de perfil ou cobrança. A
identificação visual do emissor, aceite, saída, expurgo global e telas de
convite continuam pendentes. Provas negativas e rodada completa ainda necessárias.

Leitura/recusa/revogação `ad2329c` passou nos sete gates `44100229807`.
Novo incremento implementa saída do próprio adulto e retirada pelo titular:
somente `group_id`/cobertura/revisão mudam, ingressos e sessões antigos são
invalidados. Mundos, participações, progresso e conquistas permanecem no mesmo
perfil. A repetição observa a ausência atual do vínculo, sem recriá-lo nem
alterar um outro grupo. Remover menor por esse caminho é recusado; não muda
responsabilidade. O titular pode retirar seu jogador e continuar administrador.

Provas candidatas gravam dados e conquista pelo SDK, criam mundo compartilhado
e exigem igualdade dos bytes/membros/mundo após os dois tipos de saída. Incluem
grupos recíprocos, retirada/saída simultâneas, revisão/login antigos, contexto
infantil e rollback da auditoria. Cobertura própria depois da saída, aceite,
identificação do emissor, expurgo e interfaces completas ainda pendentes.

Saída/retirada `2d39b06` passou nos sete gates `44105556797`. O retorno à
cobertura própria passa a ser uma escolha explícita do adulto, com identidade
nativa recente, revisão atual e capacidade financeira relida após a auditoria.
Não move quem ainda participa de outro grupo, não cancela contratos e não
reativa ingressos ou sessões antigos. Reutiliza o mesmo perfil, progresso,
conquistas e participações em mundos. Limites estruturais continuam de quatro
perfis e comerciais de um/quatro jogadores; pagar não obriga a ocupar vaga.
Provas candidatas incluem as duas saídas seguidas de reabertura pelo SDK,
recusa sem cobertura/vaga, login/contexto inválidos e rollback por auditoria
ou vencimento durante a transação. Ainda não qualificado nem publicado.

A candidata `0583fe6` teve integração/qualidade/cliente/checkpoint aprovados,
mas o gate de versões `44108907113` registrou `ERR_CONNECTION_RESET` de GET
de prefetch `/perfis?_rsc` durante a parada deliberada do processo A. O teste
já distinguia `ERR_CONNECTION_REFUSED` nesse mesmo intervalo e superfície.
A correção reconhece também a conexão encerrada, somente para esses GETs de
prefetch na origem/rotas autorizadas durante a troca; POST, navegação, erros de
aplicação e o período depois da saúde B continuam estritos. Não declarar a
rodada aprovada; a candidata seguinte exige novamente todos os sete gates.

Aceite candidato usa o e-mail atual e o vínculo original, declaração adulta,
ciência explícita da cobrança própria e seleção explícita de cobertura. Cria
perfil apenas quando ainda não existe; perfil existente conserva ID e dados.
Origem própria ou sem grupo é admitida, terceiro grupo exige saída anterior.
Sem vaga financiada, só o aceite explicitamente sem cobertura pode prosseguir.
Isso não inicia teste nem cancela contrato; o início comercial segue em F6.

Recibo de aceite repete somente o corpo normalizado original pela conta
destinatária e nunca reanexa quem já saiu. Composição é relida logo após os
mutexes, antes de tomar travas de conta/perfil; se mudou durante a espera, a
tentativa termina e uma nova admissão descobre todos os mutexes do zero. Não
repetir conflito de revisão do usuário nem falha desconhecida. Provas incluem
última vaga, quinto cadastro, aceites simultâneos, conta/endereço incorretos,
revogação, prazo/cobertura vencendo na auditoria, rollback e reabertura do
progresso real pelo SDK. Interfaces, expurgo e homologação ainda pendentes.

O CI de `4a2faa5` identificou dois erros de tipos: a projeção do grupo não
incluía o titular e a capacidade recebeu string sem validar `GrupoId`. A
candidata seguinte corrige os contratos, sem casts ou supressões, e inclui
expiração global auditada (lote de 100) e retenção dos recibos terminais por
24 horas (lote de 500), com `SKIP LOCKED`. O cron devolve as duas contagens;
nenhum desses passos apaga perfil, participação, dados ou auditoria. Provas de
rollback, limites e disputa por linha rodam no PostgreSQL descartável remoto.

Para apresentar convites de modo reconhecível sem revelar a conta do emissor,
o formulário pedirá nome curto escolhido por ele (mesmas regras de apelido,
sem e-mail). Só o destinatário recebe esse nome junto da pendência, com aviso
de que é identificação declarada. O campo nullable preserva a leitura de
pendências legadas; expiração/aceite/recusa/revogação o retiram junto do endereço.
Constraint limita o nome a uma pendência de 2–20 caracteres. Mudança aditiva
de schema em geração separada; 0182 ainda não existe nem foi aplicada.

0182 gerada em `44111044108`, fonte `d9a9adff`, artefato `14341771363`;
ZIP SHA `bdafe99d2e7879589c2f01a8289cccdf431260fccb5781abf6eaac6ab585bc2c`.
`0182_romantic_yellowjacket.sql`, 370 bytes, SHA
`018cab16d419dd6d287ce4c8e1f3a8ed2cc8b45a7180b046aa7f304a00f1d289`;
snapshot SHA `d5d6da88f1a1af131f95c1f7fb29cef324424f2cbdaf87670ff7e184a52808c2`;
journal SHA `11cb7044c87d7da2a3e1d6b73dfe0d77b261dac034482bc6ce6ebe5ad9ac89bb`.
Três arquivos conferidos e copiados intactos. Somente coluna nullable e check
compatível com o valor ausente; nada exige normalização de linhas antigas.
Não aplicada em produção; schema privado 0179–0182 exige qualificação conjunta.

CI compartilhado `44096609191` passou na fonte `6f5a555`. A candidata `ef715b8`
passou em integração, qualidade, cliente, versões, checkpoint e longa; navegador
geral ainda em curso. A interface seguinte inclui convite, identificação
declarada, aceite/criação de jogador, recusa/revogação, participação própria,
saída/retirada e retorno explícito à cobertura própria. Tudo exige sessão
nativa; escolher menor não abre ações, nem quando enviadas diretamente.
Jornadas com duas/três contas reais sintéticas e capturas a 390 px entram no
GitHub; prova visual e nova rodada continuam pendentes. Nenhum fluxo novo está
ativado ou publicado por este registro.

`ef715b8` concluiu os sete gates `44110794870`: 583 integrações/56 arquivos,
incluindo aceite, retorno à cobertura e retenção, com PostgreSQL real no CI.
A interface e 0182 estão em `4577c883`, sete gates `44112410551` e CI geral
`44112409473` ainda em curso. Revisão de privacidade acrescenta os dois nomes
do campo declarado à redação de contexto da telemetria; payloads SQL e eventos
Sentry já são sanitizados. Nenhum nome declarado vai para auditoria.

Revisão adicional encontrou encerramentos de partida das ações de grupo
marcados como automáticos (`actorId` nulo). A alteração de grupo já tinha
evento próprio com ator, mas cada encerramento também precisa atribuir quem
agiu e separar a conta afetada em `targetId`. Os quatro writers passam a
fornecer a identidade autenticada, com regressões para retirada pelo titular,
saída própria, cobertura e aceite. Não alterar eventos automáticos de prazo.
As provas de expiração também passam a criar identificação declarada real,
para exigir sua retirada junto do endereço e rollback quando falha a auditoria.

O navegador de `4577c883` concluiu as duas jornadas novas, mas o gate completo
`44112410551` recusou violações CSP `script-src eval` na cobertura existente
(22 testes passaram, um falhou). O formulário importava uma constante do módulo
de schemas, levando Zod e sua detecção JIT ao navegador. A constante passa a
um módulo puro, como os avatares já fazem. Validação continua no servidor e
a CSP permanece estrita; não desabilitar a vigia nem permitir `unsafe-eval`.
A próxima fonte precisa repetir o navegador completo, incluindo os hooks de
segurança das jornadas novas.

O gate de integração também passa a ensaiar a atualização da base pública
`338236d0` (0178/179 recibos) em outro banco descartável do runner: copia SQL e
journal históricos intactos pelo Git, cria dois perfis/grupos com progresso e
conquistas, aplica as migrations atuais, exige igualdade dos dados e hashes
anteriores, insere convite novo e repete a migração sem novos recibos. O
executor exige GitHub e PostgreSQL local ao runner, usa nome aleatório validado
e remove o banco/pasta no fim. Não usa banco ou registros de produção.
Esta prova adicional ainda está pendente; nenhuma migration nova foi aplicada
ao Railway, que segue em `3f2b1239`, 179 recibos e famílias/checkpoint `off`.

Revisão da identidade compartilhada encontrou outra lacuna: a guarda de
exclusão verificava somente jogador, omitindo titular sem perfil e responsável
por menor. Além disso, as FKs de grupo/perfil adulto permitiam cascata, o que
um leitor prévio não protege em concorrência. A correção amplia a guarda e
troca essas duas FKs por `RESTRICT`; o encerramento precisa resolver o domínio
antes de apagar a identidade global. Valores atuais já obedecem às mesmas FKs,
sem transformação de dados. 0183 em geração; não editar SQL e não aplicar ainda.
Testes antigos passam a distinguir exclusão global recusada de limpeza explícita
de domínio que preserva o mundo. Provas novas cobrem titular sem jogador,
participante sem grupo, responsabilidade sem jogador e conta sem vínculos.
F7 continua responsável pelo encerramento completo; esta guarda não o implementa.

`f281fdd4` passou nos sete gates `44114864787`: 585 integrações/56 arquivos,
23 jornadas de navegador aprovadas (duas condicionais puladas) e atualização
179→183 recibos com dois perfis, bytes/conquistas e repetição preservados.
Capturas de convite/participação a 390 px inspecionadas no artefato
`14343566126`, ZIP SHA
`e069e52c9b8d4b620e63fb1bbfeaeefb380f74f76a5bbdfd86e507989c76688f`:
controles, avisos e texto legíveis, sem rolagem horizontal. CSP permaneceu
estrita, e as vigias de erros/CSP foram aprovadas. A guarda de exclusão é
posterior a essa prova e ainda exige sua própria qualificação compartilhada.

0183 gerada em `44116531452`, fonte `bd256d79`, artefato `14341934734`;
ZIP SHA `806145ff3a5cf18c471eebeb2e8638680535bde617e2da40ecf2fb8d85fe436c`.
`0183_omniscient_arclight.sql`, 595 bytes, SHA
`58f4a7c70dde8819137fa82b2512d560fb20d0140dde997b298ec6cea7f33860`;
snapshot SHA `8dd8531f19bf69a3611524d4e3bd4bfeacd8abcfb1180cb609ed6a061e544c4f`;
journal SHA `a5f8beb0ef6b41a7511cee97eb9145e85cce9c9d3777679bded51d2c2b0eb6e2`.
Três arquivos conferidos e copiados intactos. Somente substituição das duas FKs;
nenhuma linha é transformada ou apagada. A transação do migrator mantém as
travas durante a troca. Aplicação futura precisa conferir cardinalidades e
restauração atual; produção continua com 179 recibos e sem convites comerciais.
