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
