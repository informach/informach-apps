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
