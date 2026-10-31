# Política de payload para `audit.events`

`audit.events` é o log operacional/compliance append-only do monorepo. Ele registra quem fez a ação, qual contrato de evento foi emitido e o mínimo de contexto necessário para investigação.

## Retenção

- Retenção padrão: 5 anos, salvo regra legal/produto mais restritiva documentada no app.
- Remoção ou anonimização retroativa exige migration/job explícito e revisão do motivo. Não apagar eventos arbitrariamente em fluxo de runtime.
- Dados fiscais/billing podem ter retenção própria; nesses casos, o payload de audit deve referenciar IDs fiscais/Stripe internos em vez de duplicar PII.

## Campos permitidos

Preferir sempre identificadores e estado transacional:

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

Eventos de billing devem registrar o ator quando a ação veio de usuário autenticado e usar payloads transacionais. `billing.checkout_started` deve incluir `checkoutSessionId`, `productId`, `subjectType`, `subjectId` e `mode`; compras de créditos podem incluir `creditAmount`. Motivos de cancelamento devem vir de enum controlado, não de texto livre.

`billing.credits_warning_sent` (notificações 50%/80%/100% do cap mensal): payload deve conter `subjectType`, `subjectId`, `threshold` (50|80|100), `remaining`, `total`, `periodStart` (ISO date) e `messageKey` para correlação com `email_deliveries`. Não gravar email bruto — usar `emailHash`/`emailDomain` se necessário (mesma regra de `email.*`).

## Observabilidade

- Sentry/APM deve receber `payloadKeys`, `eventType`, `actorId` e erro sanitizado, não o payload completo.
- Falha de persistência do audit permanece best-effort e deve ser reportada via `observability.onAuditPersistenceFailure`. A exceção é opcional e explícita: `logAuditEventStrict` (em `@informach/auth`) reporta do mesmo jeito e lança `AuditPersistenceError`, para quem não pode mostrar o dado nem concluir a ação sem o rastro. Hoje só o Bastidores usa.
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
- `bora.backup_imported`: `{ profiles, sessions, skippedProfiles }`, só contagens do que entrou e do que ficou de fora pelo limite do plano.
- `bora.pairing_started` e `bora.pairing_connected` (celular como câmera da TV): nunca incluir o código de pareamento, token, nome do aparelho, IP ou imagem. Ao implementar o emissor, registrar aqui os campos, só IDs técnicos.

Finalidade: investigar mudanças na conta da família e atender pedidos de suporte. O Bastidores mostra a frase do evento e os nomes dos campos, nunca os valores. Esses eventos não são métricas de treino.

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
