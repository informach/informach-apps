# Política de payload para `audit.events`

`audit.events` é o log operacional/compliance append-only do monorepo. Ele registra quem fez a ação, qual contrato de evento foi emitido e o mínimo de contexto necessário para investigação.

## Retenção

- Retenção padrão: 5 anos, salvo regra legal/produto mais restritiva documentada no app.
- Remoção ou anonimização retroativa exige migration/job explícito e revisão do motivo. Não apagar eventos arbitrariamente em fluxo de runtime.
- Dados fiscais/billing podem ter retenção própria; nesses casos, o payload de audit deve referenciar IDs fiscais/Stripe internos em vez de duplicar PII.

## Campos permitidos

`user.web_participation_changed` registra somente `scope`, `state`, `operationId` e `revision`, com ator no campo próprio, na transação que altera a participação e revoga sessões web. Não incluir resultados das avaliações, dados dos apps, tokens ou nomes de aparelhos. É evidência da transição técnica; o pedido autorizado e a conclusão de limpeza pertencem ao coordenador de encerramento.

`user.web_closure_changed` registra `scope`, `operationId` e `state`. `user.web_closure_step_completed` registra `scope`, `operationId`, `domain` e `phase`, na mesma transação do recibo e dos efeitos PostgreSQL. O ator usa o campo próprio. Planos, nomes, conteúdo, tokens de posse e erros de provedores não entram na auditoria. Uma etapa concluída não equivale a encerramento completo; apenas o estado final persistido confirma a operação.

Preferir sempre identificadores e estado transacional:

`recreio.plan_change_quoted`, `recreio.plan_change_accepted`,
`recreio.plan_change_closed`, `recreio.plan_change_attempt_started` e
`recreio.plan_change_provider_observed`, `recreio.plan_change_applied` e
`recreio.plan_change_selection_confirmed` e `recreio.plan_change_cancel_requested`
registram apenas `app`, `groupId`, `planChangeId`,
`subscriptionId` interno quando necessário, `revision` e `state`. O ator fica
no campo próprio. Valores, seleção de perfis e termos financeiros permanecem
no recibo comercial; não duplicar nomes, datas de nascimento, dados de cartão,
respostas do provedor ou URLs financeiras na auditoria. Fechar uma cotação
sem tentativa não comprova cancelamento de uma operação enviada.

`recreio.purchase_selection_processed` e `recreio.purchase_selection_confirmed`
registram apenas `app`, `groupId`, `authorizationId`, `subscriptionId` interno,
`revision` e `state`, com ator no campo próprio. Seleção e política ficam no
recibo; processamento pode exigir revisão e não equivale a acesso confirmado.

`recreio.payment_funding_observed` registra apenas `app`, `groupId`,
`subscriptionId`, `paymentPeriodId`, `observationId` internos e `state`, na
transação da prova e com ator no campo próprio. Valores, capturas, referências
Stripe e hashes permanecem nas tabelas financeiras. Refresh idêntico não
duplica o evento. A observação financeira sozinha não concede acesso ao jogo.

- IDs internos: `userId`, `organizationId`, `sessionId`, `subscriptionId`, `invoiceId`, `deliveryId`, `messageKey`.
- Classificadores: `category`, `status`, `role`, `reason`, `classification`, `providerEvent`, `source`.
- Chaves de correlação de provider quando não forem secretas: `providerMessageId`, `stripeEventId`, `checkoutSessionId`.
- PII mínima quando a própria identidade é o objeto auditado. Exemplo: eventos de auth como `user.created` podem registrar `email` para rastreabilidade de conta.

## Campos proibidos

Nunca gravar em `audit.events.payload`:

- Senhas, tokens, cookies, secrets, API keys, assinaturas HMAC/ECDSA, headers `Authorization`/`Cookie`.
- Payload bruto de webhook ou request/response integral de provider.
- Conteúdo de email, HTML/texto enviado, anexos, prompts completos ou mensagens de usuário.
- Dados financeiros sensíveis como PAN/cartão, CVV, bank account ou PII fiscal desnecessária.

## Emails e PII

Eventos `email.*` devem usar `emailHash` (SHA-256 do email normalizado) e `emailDomain` quando o destinatário for relevante para compliance, suppression ou unsubscribe. Não gravar email bruto em `email.*`.

Use email bruto apenas nos eventos de auth em que a identidade da conta é o próprio objeto auditado, e mantenha o payload pequeno.

## Billing

### Transações de identidade familiar

`family.events` é o registro transacional estrito das mudanças do domínio familiar. Aceita somente `event`, `groupId`, `personId`, `actorId`, `targetId` e horário; não possui payload JSON livre. Eventos de pessoa, associação, concessão/revogação, integrante, convite e transferência de administração são inseridos na mesma transação do efeito; falha impede a alteração. Não incluir nome, cor, avatar, e-mail, código de convite ou conteúdo dos apps. IDs de origem ficam em `family.migration_sources`/`app_profiles.source_key`, não em mensagens de erro públicas. Aplica-se a retenção padrão de segurança acima; anonimização exige fluxo explícito, não deleção de eventos pela UI. Esse contrato complementa `audit.events`, sem emitir uma cópia assíncrona como condição de sucesso.

Reservas e extrato Compasso registram escopo comercial, app consumidor, ator adulto, pessoa quando aplicável e `runId`. `effectiveAt` é a data de aceitação da reserva para a apropriação do saldo; `createdAt` continua indicando quando o débito foi registrado. Expiração da franquia durante uma execução aceita não deve deslocar o débito para uma compra posterior.

Eventos de billing devem registrar o ator quando a ação veio de usuário autenticado e usar payloads transacionais. `billing.checkout_started` deve incluir `checkoutSessionId`, `productId`, `subjectType`, `subjectId` e `mode`; compras de créditos podem incluir `creditAmount`. Motivos de cancelamento devem vir de enum controlado, não de texto livre.

`billing.credits_warning_sent` (notificações 50%/80%/100% do cap mensal): payload deve conter `subjectType`, `subjectId`, `threshold` (50|80|100), `remaining`, `total`, `periodStart` (ISO date) e `messageKey` para correlação com `email_deliveries`. Não gravar email bruto — usar `emailHash`/`emailDomain` se necessário (mesma regra de `email.*`).

## Observabilidade

- Sentry/APM deve receber `payloadKeys`, `eventType`, `actorId` e erro sanitizado, não o payload completo.
- Falha de persistência do audit permanece best-effort e deve ser reportada via `observability.onAuditPersistenceFailure`. A exceção é opcional e explícita: `logAuditEventStrict` (em `@informach/auth`) reporta do mesmo jeito e lança `AuditPersistenceError`, para quem não pode mostrar o dado nem concluir a ação sem o rastro. Hoje usam o Bastidores e os scripts de concessão do Recreio.
- Novo evento exige atualizar a union `AuditEventType`, a union do package emissor quando existir, docs e testes de wiring.

## Eventos do Missão Saber

Eventos `missao.*` registram o que o responsável fez com os perfis das crianças, com payload mínimo de IDs e nomes de campo. Nunca gravar apelido, mês de nascimento, ano escolar ou qualquer valor preenchido.

- `missao.profile_updated`: `{ profileId, fields }`, onde `fields` lista só os nomes dos campos alterados (`nickname`, `avatar`, `grade`, `birthMonth`, `courseId`).
- `missao.consent_recorded`: `{ profileId, scope, version }`, com `scope` igual a `profile` (criação do perfil) ou `birth_month` (mês de nascimento informado pela primeira vez na edição) e `version` igual à versão da política aceita. É append-only: a linha `families.consent_version` guarda só o estado atual, e o histórico fica aqui.

Eventos de acesso restrito: `missao.study_code_issued` e `missao.study_revoked` usam somente `{ deviceId }`; `missao.study_connected` usa `{ deviceId, profileIds }`. O ator é o titular técnico da conexão, inclusive no resgate de código: o evento não comprova presença do adulto. Nunca incluir código, token, hash de credencial, nome do aparelho, IP, apelido ou texto do estudante. Finalidade: investigar emissão e encerramento de acesso. Acesso restrito à operação autorizada, com a retenção padrão de segurança acima. Esses eventos não são métricas de aprendizagem.

## Eventos do Bora Treinar

Eventos `bora.*` registram o que o titular fez com os perfis, os treinos montados e as preferências do app `bora-treinar`, com payload mínimo de IDs, nomes de campo e contagens. Perfis costumam ser de crianças: nunca gravar apelido, cor escolhida, nome ou blocos de treino, repetições, tempos, séries ou qualquer outro número de desempenho.

- `bora.profile_created` e `bora.profile_deleted`: `{ profileId }`.
- `bora.profile_updated`: `{ profileId, fields }`, onde `fields` lista só os nomes dos campos (`name`, `color`), nunca os valores.
- `bora.custom_workout_saved`: `{ workoutId, created }`, com `created` verdadeiro quando o treino é novo. `bora.custom_workout_deleted`: `{ workoutId }`. O nome e os blocos do treino ficam fora.
- `bora.preferences_updated`: `{ fields }`, só os nomes das preferências alteradas (dias e hora do lembrete, fuso, resumo semanal), sem os valores.
- `bora.pairing_started` e `bora.pairing_connected` (celular como câmera da TV): nunca incluir o código de pareamento, token, nome do aparelho, IP ou imagem. Ao implementar o emissor, registrar aqui os campos, só IDs técnicos.
- `bora.trial_started` (o teste de 7 dias começou): payload vazio `{}`. O teste é um por e-mail, controlado pelo hash HMAC do e-mail em `bora_treinar.trial_claims`; nem o e-mail nem o hash entram no evento.
- `bora.profile_updated` também cobre as preferências de treino do perfil (`intensity`, `weeklyGoal`, `minutesPref`) e, no primeiro acesso, os níveis de partida (`levels`): `fields` lista os nomes, nunca os valores.

Finalidade: investigar mudanças na conta da família e atender pedidos de suporte. O Bastidores mostra a frase do evento e os nomes dos campos, nunca os valores. Esses eventos não são métricas de treino.

## Eventos do Dia de Estrela

Eventos `estrela.*` registram o que os adultos fizeram na família do app `dia-de-estrela`, com payload mínimo de IDs, nomes de campo e flags. As crianças são o centro do app: nunca gravar apelido, cor, nome de tarefa, passos, texto de bônus ou de item da loja, PIN, código de pareamento, token, nome do aparelho, áudio ou foto.

- `estrela.child_created` e `estrela.child_deleted`: `{ childId }`. `estrela.child_updated`: `{ childId, fields }`, só os nomes (`name`, `color`, `accessEnabled`).
- `estrela.settings_updated`: `{ fields }`, só os nomes dos ajustes alterados.
- `estrela.pin_set`: `{ first }`. `estrela.pin_unlocked` e `estrela.pin_locked` (cinco erros no aparelho): `{ deviceId }`.
- `estrela.device_code_issued`, `estrela.device_connected` (`{ deviceId, childIds }`) e `estrela.device_revoked` (`{ deviceId, via? }`).
- `estrela.guardian_invited` (`{ invitationId }`), `estrela.guardian_joined` (`{ ownerId }`) e `estrela.guardian_removed` (`{ by }`, `owner` ou `guardian`). O e-mail convidado fica fora.
- `estrela.completion_undone` (`{ childId, completionId, via }`), `estrela.bonus_given` (`{ childId, stars, via }`) e `estrela.redemption_resolved` (`{ redemptionId, childId, outcome, via }`). `via` é `adult` ou `pin`; pelo PIN no aparelho da criança, o ator registrado é o titular.
- `estrela.voice_saved` (`{ taskId, via }`) e `estrela.goal_photo_saved` (`{ childId, via }`): o arquivo nunca entra no evento.

Finalidade: investigar mudanças na conta da família e atender suporte. O Bastidores mostra a frase do evento e os nomes dos campos, nunca os valores.

## Eventos do Recreio

`recreio.trial_enrollment_recorded` registra `app`, `groupId`, `enrollmentId`,
`policyVersion` e `declarationVersion`, com o adulto nativo no campo do ator,
na transação do consentimento. `trial_enrollment_withdrawn` registra somente
`app`, `groupId` e `enrollmentId`. São declaração/retirada, nunca verificação
externa de idade ou início de teste. Não incluir nome, nascimento, e-mail,
aparelho, login, cartão ou corpo do pedido. Revogação de uma concessão real
usa o evento existente `entitlement_revoked`, na mesma transação.

`recreio.trial_started` só é gravado junto da primeira SID e do recibo único:
`app`, `groupId`, `enrollmentId`, `entitlementId`, `profileId`, `sessionId`,
`cohort` (`48h`/`7d`) e `policyVersion`. O ator é a conta real que admitiu o
aparelho, inclusive o responsável de um perfil pareado; não se fabrica sessão
ou ação nativa do pagante. Nenhum token, segredo de pareamento ou dado pessoal
entra no payload. Cadastro, autorização e ingresso não produzem esse evento.

`recreio.purchase_authorization_recorded` registra `app`, `groupId`,
`authorizationId`, `productId`, `policyVersion` e `declarationVersion`, com
o pagante nativo real no ator. `purchase_authorization_closed` registra `app`,
`groupId`, `authorizationId` e a resolução fechada `not_started`.
`purchase_attempt_started` registra `app`, `groupId`, `authorizationId` e
`productId`, antes do I/O. Não incluir URL, e-mail, cartão, dados fiscais,
segredos ou corpo do pedido; o valor aceito fica no recibo de compra próprio.
Esses eventos não comprovam pagamento ou concessão de gameplay.

`recreio.purchase_checkout_observed` registra `app`, `groupId`, `authorizationId`
e `status` (`open`, `complete`, `expired` ou `unknown`). É fato técnico do
executor, com ator nulo: captura a resposta da operação admitida mesmo quando
o login foi encerrado durante a rede. Não registra URL nem dados do customer;
capturar o fato não autoriza devolvê-lo ao aparelho e não comprova pagamento.

`recreio.billing_reconciled` e `recreio.billing_reconciliation_failed` registram
`app`, `groupId`, `providerMode` e `attemptCount`, com ator técnico nulo.
A falha acrescenta `reasonCode` fechado (`customer_unconfirmed`,
`provider_unavailable`, `evidence_mismatch`, `adverse_event`, `foreign_contract`).
Não registrar dados fiscais, períodos completos, valores, corpos do provedor,
e-mail ou URLs. Confirmação financeira, estado e corte das SIDs compartilham
a transação; uma tentativa falha não atualiza a última confirmação.

`recreio.billing_provider_event_received` registra somente `app`, `groupId`,
`providerMode`, `receiptId`, `eventType` e `adverse`, com ator técnico nulo,
na mesma transação da fila e do corte de acesso. O recibo mínimo no domínio
billing usa chave `recreio-native:<modo>:<evento>`, sem corpo bruto, assinatura,
dados fiscais ou contato. Notificação positiva agenda leitura completa; não
confirma pagamento. Replay admitido não suspende uma conta já recuperada.

`recreio.billing_portal_requested` e `recreio.billing_portal_opened` registram
`app` e `groupId`, com ator adulto atual e auditoria estrita. O primeiro admite
a solicitação antes da rede; o segundo exige nova autorização após a resposta.
Nenhuma URL do portal, customer, dados fiscais ou cartões entram na auditoria.

Social usa auditoria estrita na transação da mudança. Os eventos
`friend_code_created`/`friend_code_revoked` usam IDs de perfil/código;
`friend_request_created`/`friend_request_expired`/`friend_request_accepted`/
`friend_request_rejected`/`friend_request_revoked`, `friend_approval_recorded`
e `friend_approval_renewed`
usam IDs de pedido e perfil. `friendship_started`/`friendship_removed` usam IDs
das duas pontas e revisão. `social_protection_changed` acrescenta somente as
flags `blocked`/`muted`. Todos recebem o prefixo `recreio.` e `app: recreio`.
Não registrar código, hash, apelido, idade, nascimento, e-mail ou texto livre.
A ação do aparelho infantil tem ator nulo; aprovação é atribuída ao responsável
que efetivamente agiu. Repetição sem mudança não cria um novo evento. A remoção
da amizade não apaga auditoria nem concede administração de mundo.
`recreio.social_records_purged` usa somente as contagens de códigos, recibos,
avisos e relações removidas expurgados, com ator nulo. Não inclui IDs em lote.
Também conta referências técnicas retiradas de códigos vencidos e relações
removidas; retirar a referência não muda a amizade nem apaga um bloqueio.
`recreio.social_presence_changed` registra perfil e o classificador
`presenceMode` (`online`, `friends`, `invisible`), com ator adulto atual.
`recreio.social_notice_read` usa IDs de perfil, aviso e pedido. O ator é o
responsável nativo atual que confirmou a leitura; repetição não duplica evento.
Na candidata F5, a evidência privada do protocolo admite também a referência
opaca ao mundo comum, capturada e autorizada no servidor. Ela segue o prazo do
caso, sem conteúdo, nomes ou visibilidade desse ID na fila. Não acrescenta
campos ao evento de auditoria.

`recreio.safety_reported` usa IDs de protocolo e das duas pontas, categoria
fechada, prioridade e espécie do ator. Não inclui corpo/hash/nonce/evidência
ou identificação escolhida por pessoas. Ator infantil é nulo, e o responsável
usa sua conta real. `recreio.safety_reports_purged` registra somente contagens
apagadas e pendências que venceram sem solução, com ator nulo e sem IDs em lote.
`recreio.restriction_reconciled` registra perfil, revisão observada e o motivo
fechado `legado_sem_recibo`, sem inventar autoria ou data da suspensão antiga.
`recreio.restriction_review_requested` registra IDs de perfil/recurso, revisão
da restrição e espécie do ator (`titular`/`responsavel`), sempre com a conta
nativa atual. Nenhum deles recebe nonce, resumo do corpo ou dados da denúncia
original. Repetição não duplica auditoria nem reativa permissões.
`recreio.moderation_command_applied` identifica comando, espécie e protocolo do
caso, operação, revisão e, quando aplicável, perfil/decisão/motivo fechados.
Ator é a conta atual da equipe, com sessão nativa e duas etapas revalidadas.
Não inclui prova assinada, sessão, nonce ou hash do corpo. Recibo, efeito e
auditoria são atômicos; replay não duplica evento e exige autoridade atual.
`recreio.moderation_retention` registra somente contagens de encerramento,
expurgo de recursos/comandos e restrições já liberadas, com ator nulo.
Recurso que vence sem resposta é contado como pendência operacional, nunca
como decisão favorável ou desfavorável. Nenhum ID de pessoa/caso em lote.
`admin.recreio_safety_viewed` registra conta real da equipe, app e protocolo
opcional consultado; não inclui resultados ou conteúdo da fila. Falha impede
mostrar os casos. `admin.recreio_moderation_requested` registra a tentativa com
IDs de comando/caso e operação fechada, antes do envio. Não comprova o efeito:
somente `recreio.moderation_command_applied` confirma a transação do Recreio.
Nenhum desses eventos recebe sessão, prova HMAC, chave ou corpo do comando.
`recreio.safety_review_requested` registra protocolo, perfil solicitante,
revisão e espécie do autor atual, sem reatribuir o envio original da denúncia.
Ator de criança é nulo; responsável usa a própria conta nativa. Sem hash,
nonce, dados da outra ponta ou texto livre. Replay não duplica o evento.

Eventos `recreio.*` registram o que aconteceu com os perfis, com o direito de jogar, com as sessões de jogo e com os mundos no app `recreio`, com payload mínimo de IDs, nomes de campo, classificadores e contagens. O perfil é o que os jogos conhecem de uma pessoa: nunca gravar apelido, avatar, e-mail, IP, nome de aparelho, ingresso, token de sessão, chave, segredo de instância, nome de mundo, código de convite (nem o resumo dele), o texto de participação que o jogo guarda no convite, o resumo do mundo publicado pelo jogo ou qualquer texto livre.

- `recreio.profile_created`: `{ profileId, kind, guardianLinkId?, declarationVersion? }`, com `kind` igual a `adult` ou `minor`. Os dois campos adicionais pertencem ao cadastro sob responsabilidade declarada; nunca incluir nascimento ou texto da declaração. O ator é a conta que criou o perfil.
- `recreio.device_paired`: `{ profileId, deviceSessionId }`, ator responsável atual, emissão única na transação da aprovação. Nunca incluir código ou segredo de consulta/credencial.
- `recreio.device_context_changed`: `{ deviceSessionId, profileId?, scope }`, com `scope` `adult`, `minor` ou `management`. Mudança de seleção e restrição junto do evento estrito; repetição sem mudança não emite evento. Troca entre contextos infantis não é atribuída ao adulto só porque o login nativo pertence a ele. Nunca incluir PIN, hash, sal ou credencial.
- `recreio.protection_pin_changed`: `{ scope, profileId?, generation }`, `scope` nativo ou menor, sem PIN, hash ou sal. `recreio.minor_access_revoked`: `{ profileId, previousGeneration, generation }`. As gerações são UUIDs de autoridade, não hashes de segredo. Mudança/revogação e auditoria são atômicas.
- `recreio.profile_updated`: `{ profileId, fields }`, onde `fields` lista somente `nickname` e/ou `avatar`, nunca os valores. A edição do perfil adulto próprio revalida a sessão e grava dados/evento na mesma transação; repetição sem mudança não emite evento. Conflito com outra edição recusa a gravação.
- `recreio.minor_policy_recalculated`: `{ profileId, revision }`, ator nulo no cálculo servidor. `recreio.minor_supervision_changed`: `{ profileId, revision, changed }`, ator responsável autenticado; `changed=false` confirma a revisão sem alterar configuração. Nenhum deles registra nascimento, faixa, horários, orçamento ou conteúdo dos jogos. Política, invalidação das partidas e evento estrito são atômicos.
- `recreio.profile_data_updated`, `recreio.profile_data_conflict` e `recreio.profile_data_conflict_discarded`: `{ profileId, gameId, dataId, versionId, revision }`. Nunca registrar chave, bytes, resumo criptográfico ou progresso. O conflito é confirmado no banco antes de devolver 409; versões não resolvidas não são removidas pela retenção. Evento e alteração usam a mesma transação estrita.
- `recreio.profile_game_copy_prepared`: `{ app, profileId, gameId, keyCount, versionCount, achievementCount }`. Preparo de recorte pessoal por jogo, somente após autoridade nativa recente própria ou responsabilidade explícita. Nunca incluir nomes de chaves, bytes, checksums, progresso, apelidos, contatos ou credenciais. Falha de auditoria ou prazo impede devolver a cópia; não registra entrega de download ou exportação completa da conta.
- `recreio.profile_game_inventory_viewed`: `{ app, profileId, gameCount, hasMore }`. Página de IDs de jogos com dados pessoais persistidos, sob a mesma autoridade recente do recorte. Não registrar IDs da página, cursor, chaves, conteúdo ou contato; não afirma captura consistente de várias páginas ou exportação completa.
- `recreio.profile_record_copy_prepared`: `{ app, profileId, kind }`. Cópia do cadastro/proteção/supervisão/preferência social sob autoridade pessoal recente. Nunca registrar nome, nascimento, horários, PIN/hash/gerações, declaração, contato ou conteúdo; não representa exportação completa ou entrega de download.
- `recreio.achievement_unlocked`: `{ profileId, gameId, achievementId }`, somente IDs de conquista do manifesto estático. Nunca registrar chave de idempotência. Repetição do recibo não emite evento; conquistas declaradas pelo cliente não dão dinheiro ou direito de jogar.
- `recreio.device_session_revoked`: `{ deviceSessionId, profileId? }`, ator da própria conta adulta. Sem jogador selecionado, omitir `profileId`; não criar perfil para auditar administração. Revogação de outro aparelho de login e fim das partidas usam a mesma transação do evento estrito. Repetição sem efeito não emite novo evento; nunca incluir token, ID da sessão de login, IP, user-agent ou nome do aparelho. Não altera acessos de outros apps. A ampliação para conta sem perfil está no incremento de gestão; conferir a implantação no registro antes de assumir produção.
- `recreio.entitlement_granted`: `{ entitlementId, groupId, targetId, tier, days, reasonCode }`, com `tier` igual a `individual` ou `family`, `days` o número de dias concedidos e `targetId` a conta titular do grupo.
- `recreio.entitlement_revoked`: `{ entitlementId, groupId, targetId, reasonCode }`.
- `recreio.group_coverage_updated`: `{ groupId, profileId, revision, enabled }`, ator titular ou adulto que escolheu voltar à própria cobertura; revisão, encerramentos e evento estrito na mesma transação. Pagamento não concede edição de perfil adulto de terceiro.
- `recreio.group_member_left` e `recreio.group_member_removed`: `{ groupId, profileId, revision }`, ator adulto que saiu ou titular que retirou. Não removem identidade, responsabilidade infantil, progresso ou participações em mundos.
- `recreio.group_invite_created`: `{ groupId, inviteId, declarationVersion }`, ator emissor. `recreio.group_invite_accepted`: `{ groupId, inviteId, profileId, enabled, declarationVersion }`, ator destinatário autenticado; declaração não comprova verificação externa de idade. Aceite e recibo idempotente são atômicos com o evento estrito.
- `recreio.group_invite_revoked`, `recreio.group_invite_declined` e `recreio.group_invite_expired`: `{ groupId, inviteId }`, ator emissor, destinatário ou nulo na expiração global. Nunca incluir endereço, identificação declarada, resumo do corpo ou qualquer credencial. Pendências retiram endereço/identificação ao encerrar; recibos técnicos são expurgados após 24 horas, sem apagar estes eventos de auditoria. Conferir a implantação em `docs/recreio/grupos-adultos-2026-11-17.md`.

`reasonCode` é um código curto e fechado (letras minúsculas, números e `_`, até 40 caracteres, conferido pelo script e pelo banco), não uma explicação escrita: quem concede escolhe o código, e a conversa com a pessoa fica fora do evento. Todos levam também `app: "recreio"`.

As concessões são gravadas pelos scripts `conceder` e `revogar` de `apps/recreio`, sem conta de equipe por trás: o ator é nulo e o evento entra pela forma estrita (`logAuditEventStrict`), na mesma transação da linha em `recreio.entitlements`. Se o evento não grava, a concessão ou a revogação também não ficam. `recreio.profile_created` também usa `logAuditEventStrict` com o writer da mesma transação que cria perfil e grupo. Se a auditoria falha, a criação é revertida. Uma repetição que encontra o perfil já criado não emite outro evento.

Sessões de jogo (eventos pessoais: `targetId` é a conta dona da sessão de aparelho):

- `recreio.game_session_started`: `{ sessionId, profileId, gameId, replacedSessionId, targetId }`. `replacedSessionId` é a sessão encerrada por "continuar aqui", ou `null`. O ator é a conta.
- `recreio.game_session_ended`: `{ sessionId, profileId, gameId, reason, targetId }`, com `reason` igual a `left`, `replaced`, `signed_out`, `access_lost`, `expired` ou `permissions_changed`. O ator é a conta quando foi ela que causou o fim (`left`, `replaced`, `signed_out`, `permissions_changed`) e nulo quando foi o Recreio (`access_lost`, `expired`, ou `signed_out` detectado na renovação). O novo motivo exige leitores compatíveis implantados antes da primeira emissão.
- `recreio.ticket_rejected`: `{ profileId, gameId, reason }`, com `reason` igual a `used_or_expired`, `device_session`, `access` ou `game`. Ator nulo. Só é gravado para ingresso com assinatura válida do Recreio: token inválido ou adulterado não gera evento, para a tabela não virar alvo de quem manda lixo.
- `recreio.session_save_completed`: `{ app, profileId, sessionId, savePermitId, gameId }`. Capacidade restrita de finalização, ainda em candidata: recibo, dados e encerramento são atômicos. Repetição idêntica não grava outro evento. Não registrar token, corpo, chave de dados, hash de conteúdo ou resultados do jogo. A margem de persistência não autoriza gameplay.
- `recreio.session_save_prepared`: os mesmos IDs técnicos, somente na criação da capacidade junto da primeira sessão negociada. Renovação e recuperação não criam outra capacidade nem duplicam o evento; falha estrita reverte ingresso, sessão e recibo.

Na transferência aceita, o encerramento das duas partidas registra em `actorId`
a conta de quem aceitou. `targetId` conserva a conta afetada de cada partida.

Mundos, convites e posse. **Eventos de mundo não levam `targetId`**: um mundo é de várias contas, então o evento só se liga a uma pessoa pelo ator (a conta do perfil que agiu), e quem investiga um mundo filtra por `spaceId`.

- `recreio.visit_session_closed`: `{ spaceId, visitId, sessionId, visitSessionId, profileId, reason }`; ator nulo, atestado restrito da instância original. Motivos fechados `left`, `visit_ended`, `session_ended`, `replaced`. Cursor/SID, vínculo, eventual encerramento da concessão e eventos são atômicos. Repetição não altera datas ou emite outro evento. O recibo só confirma SID realmente encerrado; não representa ACK de salvamento nem encerra sucessor/partida de outro mundo.

- `recreio.visit_session_admitted`: `{ spaceId, visitId, sessionId, visitSessionId, profileId, previousSessionId }`. Só a primeira admissão desse SID gera evento; repetição/revalidação não cria outra concessão. `previousSessionId` é nulo ou o SID realmente substituído por checkpoint confirmado e ingresso consumido para este sucessor. Vínculos, SID e evento são atômicos. Não contém membro/papel, apelido, política completa, endereço, token, prova ou conteúdo de jogo.

- `recreio.space_created`: `{ spaceId, gameId, profileId, memberId, contentPolicy }`. `contentPolicy` é o id da política de mundo do manifesto do jogo.
- `recreio.host_presence_started`, `recreio.host_presence_closed`: `{ spaceId, instanceId, profileId, sid, presenceId, fence, reason? }`, ator nulo para o atestado técnico da instância ou expiração. `reason` é código fechado; sem apelido, token, chave de repetição, hash, endereço ou conteúdo. Efeito e evento estrito são atômicos; repetição do recibo não emite outro evento. `recreio.host_presences_purged`: `{ count }`, lote técnico limitado. Candidatos da fundação de visitas, ainda sem implantação ou concessão de participação.
- `recreio.visit_invite_closed`: `{ spaceId, inviteId, state }`; `recreio.visit_closed`: `{ spaceId, inviteId, visitId, profileId, reason }`; ator nulo na expiração técnica, códigos fechados. `recreio.visit_receipts_purged`: `{ count, visitCount, sessionCount? }`, contagens de convites/concessões/vínculos de SID removidos depois da retenção. Lotes de até 500 convites, efeito e auditoria estrita na mesma transação; nenhum conteúdo, apelido, token ou prova de presença do jogo no evento. Não equivale a encerrar uma sessão de jogo. Vínculo de SID ainda aberto impede o expurgo; os vínculos técnicos são removidos antes da concessão, sem apagar as sessões.
- `recreio.visit_invite_created`: `{ spaceId, inviteId, memberId, profileId, targetProfileId, worldApproved }`; `worldApproved` registra a decisão automática permitida pela política atual do mundo, sem substituir aprovações parentais. Ator é a conta do jogador adulto, ou nulo para o perfil infantil; sem apelido, presença/localização pública, código, nonce ou hash do pedido. Convite, decisão automática e evento estrito são atômicos; replay não repete o evento nem cria concessão.
- `recreio.visit_invite_guardian_approved`: `{ spaceId, inviteId, profileId, policyVersion }`; `recreio.visit_invite_world_approved`: `{ spaceId, inviteId, memberId, actorKind, managementRevision }`. Ator é o adulto autenticado que tomou a decisão nativa, com login recente. Registros e eventos estritos são atômicos; repetição da mesma prova atual não cria outro evento. Decisão de mundo não substitui consentimento de cada menor; não se registra conteúdo, apelido, código ou credencial.
- `recreio.visit_invite_accepted`: `{ spaceId, inviteId, visitId, profileId }`, ator do destinatário atual (nulo no aparelho infantil), aceite/concessão/evento estrito na mesma transação. Reduções de `recreio.visit_invite_closed` e `recreio.visit_closed` podem acrescentar `{ actorProfileId, actorKind }`: `profileId` continua sendo o visitante afetado, `actorProfileId` identifica a ponta autenticada e `actorKind` distingue jogador/responsável. Ator é a conta atual do adulto decisor ou nulo no aparelho infantil/expiração técnica. Replay não reabre concessão nem registra evento duplicado; nenhum desses eventos confirma encerramento de SID ou checkpoint.
- `recreio.space_invite_created`: `{ spaceId, inviteId, memberId, form, directed? }`, com `memberId` o membro que convidou e `form` igual a `member`. `directed=true` distingue o recibo dirigido, sem expor destinatário ou corpo.
- `recreio.space_invite_accepted`: `{ spaceId, inviteId, profileId, memberId, directed? }`.
- `recreio.directed_invite_guardian_approved`: `{ spaceId, inviteId, profileId, policyVersion }`, com o adulto nativo atual como ator; o perfil é o menor sob seus cuidados.
- `recreio.directed_invite_world_approved`: `{ spaceId, inviteId, memberId, actorKind, managementRevision }`, com ator nativo atual. Esta decisão não substitui consentimento parental.
- `recreio.directed_invite_closed`: `{ spaceId, inviteId, state, profileId?, actorKind? }`, estado fechado `declined`, `revoked` ou `expired`; ator nulo apenas na expiração técnica. No encerramento parental, `profileId` é o próprio menor sob cuidados, `actorKind=responsavel` e o ator é o adulto nativo atual. Não remove participação já aceita.
- `recreio.directed_invites_purged`: `{ count }`, ator nulo, lote limitado e atômico. Eventos de convites dirigidos ainda são candidatos, sem implantação. Nunca corpo, nonce, hash, código, nome, e-mail, geração ou conteúdo do jogo.
- `recreio.space_member_joined`: `{ spaceId, memberId, profileId, role, invitedByMemberId }`. Sai junto com o aceite, na mesma transação.
- `recreio.space_member_removed`: `{ spaceId, memberId, profileId }`, com perfil nulo quando já excluído. O ator é o responsável autenticado que removeu. A mudança do vínculo, retirada de propostas e fim das partidas são atômicos; a repetição não duplica o evento. Preserva conteúdo e autoria. Implantado no alfa fechado em `1ed101be`, sem abrir venda ou proteção familiar completa.
- `recreio.space_invites_revoked`: `{ spaceId, memberId, reason, count, directedCount? }`, somente contagem/IDs; `reason` é `steward_changed`, `member_removed`, `coadmin_removed`, `world_archived` ou `member_left`. A conta autenticada que confirmou a mudança é o ator. Revogação e evento estrito compartilham a transação da mudança, sem códigos, nomes, hashes de convite ou conteúdo. Saída, coadmin, arquivo e dirigidos continuam candidatos em F5.
- `recreio.space_management_changed`: `{ spaceId, profileId, operation, revision, memberId?, role?, membersInvite?, actorKind? }`. Operação e opções fechadas, ator nativo real; sem conteúdo, nome ou conta de outro membro. Na gestão do mundo do menor, `actorKind=responsavel`, `profileId` é o perfil sob cuidados e o ator continua sendo o adulto autenticado. Revisão de gestão é distinta de fotografia/cerca. A auditoria e os efeitos são atômicos; recusa ou ausência de mudança não inventam evento aplicado. Candidato F5, não implantado.
- `recreio.space_stewardship_requested`, `recreio.space_stewardship_accepted`, `recreio.space_stewardship_declined`, `recreio.space_stewardship_revoked`, `recreio.space_stewardship_expired`: `{ spaceId, requestId, fromMemberId, toMemberId }`; na candidata de transferência infantil, também `{ actorKind, profileId }` para distinguir a proposta do responsável e a decisão do jogador destinatário. A conta autenticada é o ator; nomes, e-mails, códigos e conteúdo não entram no evento. Proposta e conclusão acompanham a mudança na mesma transação. A repetição terminal não emite outro evento nem reaplica a autoridade. Escritores adultos implantados no alfa fechado em `92f665e7`; homologação humana adiada pelo titular. O incremento infantil ainda não está implantado.
- `recreio.space_lease_taken_over`: `{ spaceId, previousLeaseId, previousFence, previousInstanceId, leaseId, fence, instanceId }`. Ator nulo. Sai quando abrir um mundo encontra a posse vencida, fecha-a e atribui outra.
- `recreio.space_write_refused`: `{ spaceId, gameId, instanceId, fence, operation }`, com `operation` igual a `journal`, `snapshot` ou `release`. Ator nulo. Sai quando uma instância autenticada tenta escrever sem a posse (cerca velha, posse vencida ou de outra instância). Pedido com segredo errado ou para mundo de outro jogo não gera evento.
- `recreio.space_restored`: `{ operationId, spaceId, gameId, sourceRevision, previousRevision, revision, journalSeq, fence, reasonCode }`, com ator nulo no comando técnico autenticado pela conexão operacional. Nova revisão e evento entram na mesma transação. O UUID identifica o recibo de repetição e fica vinculado a mundo, revisão escolhida, topo anterior e motivo. Não registrar corpo, hash de conteúdo, nomes, apelidos ou fatos do jogo. A inspeção do CLI mostra somente metadados técnicos; não cria acesso ao conteúdo pelo Bastidores.

Como entram: os eventos que acompanham uma gravação (`game_session_started`, `game_session_ended`, `space_*` menos `space_write_refused`) usam a forma estrita, na mesma transação da mudança: ou os dois ficam gravados, ou nenhum. As recusas (`ticket_rejected`, `space_write_refused`) não têm transação para acompanhar e seguem a forma padrão, sem derrubar a resposta se a auditoria falhar.

Finalidade: saber quem recebeu o direito de jogar, por quanto tempo e por qual motivo; reconstruir quem abriu e encerrou sessões de jogo; investigar entrada em mundos e troca de instância; e atender suporte. Não são métricas de jogo: nada do que acontece dentro de um mundo passa por aqui.

## Eventos da Agenda da Turma

Eventos `agenda.*` registram mutações de domínio do app `agenda-da-turma` com payload mínimo de IDs e flags operacionais. Não gravar nomes de estudantes, nomes de matérias, títulos, descrições ou conteúdo livre de atividades.

Eventos atuais:

- `agenda.student_profile_created`, `agenda.student_profile_updated`, `agenda.student_profile_deleted`
- `agenda.turma_created_or_joined`, `agenda.turma_joined_by_code`, `agenda.turma_set_active`, `agenda.turma_left`, `agenda.turma_updated`, `agenda.turma_deleted`
- `agenda.subject_created`, `agenda.subject_updated`, `agenda.subject_deleted`
- `agenda.activity_created`, `agenda.activity_updated`, `agenda.activity_deleted`, `agenda.activity_status_set`, `agenda.activity_shared_response`

## Eventos do Bastidores

Eventos `admin.*` registram consultas e ações da equipe no Bastidores (`apps/admin`). O ator é sempre a conta owner ou admin que agiu; a conta afetada vai em `targetId`. Nada de conteúdo da pessoa, e-mail, IP ou dado de aparelho além do ID.

- `admin.user_viewed`: `{ targetId }`. Gravado ao abrir a ficha de uma pessoa; a mesma pessoa da equipe olhando a mesma ficha em menos de 10 minutos não gera nova linha.
- `admin.sessions_revoked`: `{ targetId, count, apps, reason }`, com `apps` listando os slugs alcançados.
- `admin.verification_resent`: `{ targetId, app }`.
- `admin.edi_device_disconnected`: `{ targetId, deviceId, reason }`.
- `admin.audit_exported`: `{ filters, rows }`, com `filters` só nos nomes e valores dos filtros (tipo, período, IDs).

Banimento e papel usam os eventos do pacote de autenticação, também em nome de quem agiu: `user.banned` e `user.unbanned` com `{ targetId, reason }`, e `user.role_changed` com `{ targetId, previousRole, newRole, reason }` (o script do primeiro owner grava `source` no lugar de `reason`). Toda ação que muda algo leva motivo, inclusive desbanir e mudar papel. `reason` é texto curto (até 280 caracteres) escrito pela equipe para explicar a ação; a tela orienta a não colar mensagens da pessoa nem dados além do necessário.

No Bastidores a gravação é estrita: abrir a ficha e exportar a auditoria só mostram os dados com o evento gravado; banir, desbanir e mudar papel gravam o evento na mesma transação da mudança; encerrar sessões, reenviar confirmação e desconectar computador mostram erro e reportam `audit.change_unrecorded` quando a mudança aconteceu e o evento não gravou.
