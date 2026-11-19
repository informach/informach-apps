# Recreio — inventário técnico para direitos e encerramento

Inventário estático da candidata, sem consulta ou alteração de produção. Não é
política de retenção aprovada, plano consentido, prova de expurgo ou autorização
para apagar. Nenhuma cascata deve ser executada a partir deste documento.

## Proveniência e cobertura

- Snapshot gerado e preservado: `0215_snapshot.json`, id `01a596f1-b108-4e08-a4be-faff002a3481`.
- SHA-256: `e0e6e6ba7d2519bebd2971760ada8f26614fbd370d4f29eaee35ff3c62064ddc`.
- 63 tabelas no schema `recreio`, 140 FKs de saída.
- Cada tabela foi associada explicitamente a um domínio abaixo e ao schema fonte.
- Não há FK de outro schema apontando para `recreio` nesse snapshot. Isso não
  cobre vínculos lógicos em billing/auditoria, Redis, objetos ou bytes do jogo.
- O snapshot é candidato: produção ainda está em 0203. Este inventário não
  comprova que as tabelas novas estejam implantadas.

## Fronteiras que exigem coordenação

1. `groups.owner_user_id` e `profiles.user_id` restringem excluir a identidade
   global. Encerramento do Recreio não deve apagar `core.users` nem outros apps.
2. `purchase_profiles.profile_reference` e `plan_change_profiles.profile_reference`
   retêm a referência original mesmo após `profile_id` virar NULL. Fonte de
   consentimento/financiamento não deve ser apagada ou falsamente anonimizada
   pela exclusão do perfil; política de retenção e minimização precisam de
   tratamento explícito, incluindo o ledger e fatos core do mesmo pagante.
3. Fotografias, diário, resumo e nome do mundo podem conter identificadores ou
   textos livres sem FK. O adapter deve tratar estado e histórico, e o replay
   de restauração deve reaplicar a retirada antes de servir o mundo.
4. Convites de grupo armazenam `recipient_email` e `sender_label`. SET NULL em
   IDs não remove essas cópias; cancelamento, expurgo e relações dos demais
   adultos precisam de uma decisão própria no encerramento.
5. Credenciais e seus hashes/gerações não são conteúdo de download. O recorte
   pessoal usa projeções explícitas e não devolve linha de banco integral.
6. Moderação/denúncia, auditoria e fatos financeiros podem incluir terceiros
   e retenções próprias. Ausência de FK ou de nome na interface não comprova
   anonimização; o plano precisa justificar o que fica e resolver dependências.
7. Revogar ingressos/SIDs/aparelhos não cerca por si só a instância que escreve
   o mundo. Congelamento e adapter devem conservar cerca/revisão/recibo e
   impedir reintrodução por writers antigos.

## Tabelas e relações persistidas

| Tabela | Domínio de coordenação | Referências de saída e efeito SQL | Fonte |
| --- | --- | --- | --- |
| `adult_declarations` | identidade e responsabilidade | `user_id` → `core.users` (cascade) | [schema](../../packages/db/src/schema/recreio-familia.ts) |
| `billing_contracts` | fatos comerciais e financeiros | `subscription_id` → `billing.subscriptions` (restrict); `purchase_id,group_id,payer_user_id,provider_mode,origin_product_id` → `recreio.purchase_authorizations` (restrict); `current_plan_change_id,subscription_id,purchase_id,group_id,payer_user_id,provider_mode,current_product_id,current_price_id,current_plan_applied_at,revision` → `recreio.plan_changes` (restrict) | [schema](../../packages/db/src/schema/recreio-planos.ts) |
| `billing_reconciliations` | fatos comerciais e financeiros | `group_id,payer_user_id` → `recreio.groups` (restrict) | [schema](../../packages/db/src/schema/recreio-comercial.ts) |
| `device_sessions` | proteção e uso | `user_id` → `core.users` (cascade); `active_profile_id` → `recreio.profiles` (set null) | [schema](../../packages/db/src/schema/recreio.ts) |
| `directed_invite_guardian_approvals` | mundos e presença compartilhados | `approved_by_user_id` → `core.users` (set null); `invite_id,origin_profile_id,target_profile_id` → `recreio.directed_space_invites` (cascade); `guardian_link_id,profile_id` → `recreio.guardian_links` (cascade) | [schema](../../packages/db/src/schema/recreio-convites-dirigidos.ts) |
| `directed_invite_world_approvals` | mundos e presença compartilhados | `approved_by_user_id` → `core.users` (set null); `guardian_link_id` → `recreio.guardian_links` (cascade); `invite_id,space_id` → `recreio.directed_space_invites` (cascade); `space_id,approved_by_member_id` → `recreio.space_members` (restrict) | [schema](../../packages/db/src/schema/recreio-convites-dirigidos.ts) |
| `directed_space_invites` | mundos e presença compartilhados | `space_id` → `recreio.spaces` (restrict); `origin_profile_id` → `recreio.profiles` (restrict); `target_profile_id` → `recreio.profiles` (restrict); `space_id,invited_by_member_id,origin_profile_id` → `recreio.space_members` (restrict) | [schema](../../packages/db/src/schema/recreio-convites-dirigidos.ts) |
| `entitlements` | fatos comerciais e financeiros | `group_id` → `recreio.groups` (cascade); `granted_by_user_id` → `core.users` (set null); `revoked_by_user_id` → `core.users` (set null) | [schema](../../packages/db/src/schema/recreio.ts) |
| `friend_codes` | social e convites | `profile_id` → `recreio.profiles` (cascade) | [schema](../../packages/db/src/schema/recreio-social.ts) |
| `friend_consents` | social e convites | `profile_id` → `recreio.profiles` (cascade); `approved_by_user_id` → `core.users` (set null); `request_id,request_origin_profile_id,request_target_profile_id` → `recreio.friend_requests` (cascade); `guardian_link_id,profile_id` → `recreio.guardian_links` (cascade) | [schema](../../packages/db/src/schema/recreio-social.ts) |
| `friend_requests` | social e convites | `origin_profile_id` → `recreio.profiles` (cascade); `target_profile_id` → `recreio.profiles` (cascade); `code_id,target_profile_id` → `recreio.friend_codes` (restrict) | [schema](../../packages/db/src/schema/recreio-social.ts) |
| `friendships` | social e convites | `lower_profile_id` → `recreio.profiles` (cascade); `higher_profile_id` → `recreio.profiles` (cascade); `request_id,lower_profile_id,higher_profile_id,request_state` → `recreio.friend_requests` (restrict) | [schema](../../packages/db/src/schema/recreio-social.ts) |
| `funding_captures` | fatos comerciais e financeiros | `observation_id` → `recreio.funding_observations` (restrict) | [schema](../../packages/db/src/schema/recreio-financiamento.ts) |
| `funding_observations` | fatos comerciais e financeiros | `payment_period_id,subscription_id,provider` → `billing.subscription_payment_periods` (restrict); `subscription_id,purchase_id,group_id,payer_user_id,provider_mode,origin_product_id` → `recreio.billing_contracts` (restrict) | [schema](../../packages/db/src/schema/recreio-financiamento.ts) |
| `funding_source_periods` | fatos comerciais e financeiros | `observation_id,provider_charge_id` → `recreio.funding_captures` (restrict); `observation_id,group_id,payer_user_id,provider_mode` → `recreio.funding_observations` (restrict); `source_payment_period_id,source_subscription_id,provider` → `billing.subscription_payment_periods` (restrict); `source_subscription_id,source_purchase_id,group_id,payer_user_id,provider_mode,source_origin_product_id` → `recreio.billing_contracts` (restrict) | [schema](../../packages/db/src/schema/recreio-financiamento.ts) |
| `game_instances` | infraestrutura | sem FK | [schema](../../packages/db/src/schema/recreio.ts) |
| `game_sessions` | proteção e uso | `profile_id` → `recreio.profiles` (cascade); `device_session_id` → `recreio.device_sessions` (cascade); `space_id` → `recreio.spaces` (set null) | [schema](../../packages/db/src/schema/recreio.ts) |
| `game_tickets` | proteção e uso | `profile_id` → `recreio.profiles` (cascade); `device_session_id` → `recreio.device_sessions` (cascade); `opened_session_id,profile_id` → `recreio.game_sessions` (cascade) | [schema](../../packages/db/src/schema/recreio.ts) |
| `group_invites` | social e convites | `recipient_user_id` → `core.users` (cascade); `group_id,inviter_user_id` → `recreio.groups` (cascade); `accepted_profile_id,accepted_user_id` → `recreio.profiles` (set null) | [schema](../../packages/db/src/schema/recreio-grupo.ts) |
| `groups` | identidade e responsabilidade | `owner_user_id` → `core.users` (restrict) | [schema](../../packages/db/src/schema/recreio.ts) |
| `guardian_links` | identidade e responsabilidade | `profile_id` → `recreio.minor_profiles` (cascade); `declaration_id,guardian_user_id` → `recreio.adult_declarations` (restrict) | [schema](../../packages/db/src/schema/recreio-familia.ts) |
| `minor_daily_usage` | proteção e uso | `profile_id` → `recreio.minor_profiles` (cascade); `session_id,profile_id` → `recreio.game_sessions` (no action) | [schema](../../packages/db/src/schema/recreio-politicas.ts) |
| `minor_policies` | proteção e uso | `profile_id` → `recreio.minor_profiles` (cascade) | [schema](../../packages/db/src/schema/recreio-politicas.ts) |
| `minor_profiles` | identidade e responsabilidade | `profile_id,kind` → `recreio.profiles` (cascade) | [schema](../../packages/db/src/schema/recreio-familia.ts) |
| `minor_protection` | proteção e uso | `profile_id` → `recreio.minor_profiles` (cascade); `guardian_link_id` → `recreio.guardian_links` (cascade) | [schema](../../packages/db/src/schema/recreio-protecao.ts) |
| `moderation_commands` | proteção e moderação | `report_id` → `recreio.safety_reports` (set null); `restriction_review_id` → `recreio.restriction_reviews` (set null); `moderator_user_id` → `core.users` (set null) | [schema](../../packages/db/src/schema/recreio-moderacao.ts) |
| `native_pins` | proteção e uso | `user_id` → `core.users` (cascade) | [schema](../../packages/db/src/schema/recreio-protecao.ts) |
| `paired_credentials` | proteção e uso | `device_session_id` → `recreio.device_sessions` (cascade); `profile_id` → `recreio.minor_protection` (cascade); `guardian_user_id` → `core.users` (restrict) | [schema](../../packages/db/src/schema/recreio-protecao.ts) |
| `pairing_requests` | proteção e uso | `profile_id` → `recreio.minor_profiles` (cascade); `guardian_link_id` → `recreio.guardian_links` (cascade); `device_session_id` → `recreio.device_sessions` (cascade) | [schema](../../packages/db/src/schema/recreio-protecao.ts) |
| `payment_funding` | fatos comerciais e financeiros | `observation_id,payment_period_id` → `recreio.funding_observations` (restrict) | [schema](../../packages/db/src/schema/recreio-financiamento.ts) |
| `plan_change_profiles` | fatos comerciais e financeiros | `profile_id` → `recreio.profiles` (set null); `plan_change_id,group_id` → `recreio.plan_changes` (restrict) | [schema](../../packages/db/src/schema/recreio-planos.ts) |
| `plan_changes` | fatos comerciais e financeiros | `subscription_id` → `billing.subscriptions` (restrict); `purchase_id,group_id,payer_user_id,provider_mode,origin_product_id` → `recreio.purchase_authorizations` (restrict) | [schema](../../packages/db/src/schema/recreio-planos.ts) |
| `profile_achievements` | dados pessoais de jogo | `profile_id` → `recreio.profiles` (cascade) | [schema](../../packages/db/src/schema/recreio-dados.ts) |
| `profile_creation_requests` | identidade e responsabilidade | `user_id` → `core.users` (cascade); `profile_id` → `recreio.minor_profiles` (set null) | [schema](../../packages/db/src/schema/recreio-familia.ts) |
| `profile_data_keys` | dados pessoais de jogo | `profile_id` → `recreio.profiles` (cascade) | [schema](../../packages/db/src/schema/recreio-dados.ts) |
| `profile_data_versions` | dados pessoais de jogo | `data_id,profile_id,game_id` → `recreio.profile_data_keys` (cascade) | [schema](../../packages/db/src/schema/recreio-dados.ts) |
| `profile_restrictions` | proteção e moderação | `profile_id` → `recreio.profiles` (cascade); `source_report_id` → `recreio.safety_reports` (set null); `moderator_user_id` → `core.users` (set null) | [schema](../../packages/db/src/schema/recreio-moderacao.ts) |
| `profiles` | identidade e responsabilidade | `user_id` → `core.users` (restrict); `group_id` → `recreio.groups` (set null) | [schema](../../packages/db/src/schema/recreio.ts) |
| `purchase_authorizations` | fatos comerciais e financeiros | `group_id,payer_user_id` → `recreio.groups` (restrict) | [schema](../../packages/db/src/schema/recreio-comercial.ts) |
| `purchase_profiles` | fatos comerciais e financeiros | `profile_id` → `recreio.profiles` (set null); `purchase_id,group_id,payer_user_id,provider_mode,product_id` → `recreio.purchase_authorizations` (restrict) | [schema](../../packages/db/src/schema/recreio-comercial.ts) |
| `restriction_reviews` | proteção e moderação | `profile_id` → `recreio.profiles` (cascade); `actor_user_id` → `core.users` (set null) | [schema](../../packages/db/src/schema/recreio-moderacao.ts) |
| `safety_reports` | proteção e moderação | `reporter_profile_id` → `recreio.profiles` (set null); `target_profile_id` → `recreio.profiles` (set null); `actor_user_id` → `core.users` (set null); `review_actor_user_id` → `core.users` (set null) | [schema](../../packages/db/src/schema/recreio-moderacao.ts) |
| `session_handoffs` | proteção e uso | `to_device_session_id` → `recreio.device_sessions` (cascade); `ticket_jti` → `recreio.game_tickets` (cascade); `from_session_id,profile_id` → `recreio.game_sessions` (cascade) | [schema](../../packages/db/src/schema/recreio-checkpoints.ts) |
| `session_save_permits` | proteção e uso | `checkpoint_space_id` → `recreio.spaces` (restrict); `session_id,profile_id` → `recreio.game_sessions` (cascade) | [schema](../../packages/db/src/schema/recreio-salvamento.ts) |
| `social_blocks` | social e convites | `actor_profile_id` → `recreio.profiles` (cascade); `target_profile_id` → `recreio.profiles` (cascade) | [schema](../../packages/db/src/schema/recreio-social.ts) |
| `social_notices` | social e convites | `guardian_user_id` → `core.users` (cascade); `profile_id` → `recreio.profiles` (cascade); `request_id,request_origin_profile_id,request_target_profile_id` → `recreio.friend_requests` (cascade) | [schema](../../packages/db/src/schema/recreio-social.ts) |
| `social_preferences` | social e convites | `profile_id` → `recreio.profiles` (cascade) | [schema](../../packages/db/src/schema/recreio-social.ts) |
| `space_invites` | mundos e presença compartilhados | `space_id` → `recreio.spaces` (restrict); `target_profile_id` → `recreio.profiles` (set null); `accepted_by_profile_id` → `recreio.profiles` (set null); `space_id,invited_by_member_id` → `recreio.space_members` (restrict) | [schema](../../packages/db/src/schema/recreio.ts) |
| `space_journal` | mundos e presença compartilhados | `space_id` → `recreio.spaces` (restrict) | [schema](../../packages/db/src/schema/recreio.ts) |
| `space_leases` | mundos e presença compartilhados | `space_id` → `recreio.spaces` (restrict); `instance_id` → `recreio.game_instances` (set null) | [schema](../../packages/db/src/schema/recreio.ts) |
| `space_members` | mundos e presença compartilhados | `space_id` → `recreio.spaces` (restrict); `profile_id` → `recreio.profiles` (set null); `space_id,invited_by_member_id` → `recreio.space_members` (restrict) | [schema](../../packages/db/src/schema/recreio.ts) |
| `space_snapshots` | mundos e presença compartilhados | `space_id` → `recreio.spaces` (restrict) | [schema](../../packages/db/src/schema/recreio.ts) |
| `space_stewardship_requests` | mundos e presença compartilhados | `space_id` → `recreio.spaces` (restrict); `space_id,from_member_id` → `recreio.space_members` (restrict); `space_id,to_member_id` → `recreio.space_members` (restrict) | [schema](../../packages/db/src/schema/recreio.ts) |
| `space_visit_invites` | mundos e presença compartilhados | `host_presence_id,space_id,origin_profile_id,host_session_id,host_member_id` → `recreio.world_host_presences` (restrict); `target_profile_id` → `recreio.profiles` (restrict) | [schema](../../packages/db/src/schema/recreio-visitas.ts) |
| `spaces` | mundos e presença compartilhados | `steward_profile_id` → `recreio.profiles` (set null); `created_by_profile_id` → `recreio.profiles` (set null) | [schema](../../packages/db/src/schema/recreio.ts) |
| `stewardship_guardian_approvals` | mundos e presença compartilhados | `request_id` → `recreio.space_stewardship_requests` (cascade); `approved_by_user_id` → `core.users` (set null); `guardian_link_id,profile_id` → `recreio.guardian_links` (cascade) | [schema](../../packages/db/src/schema/recreio-sucessao.ts) |
| `trial_claims` | fatos comerciais e financeiros | `enrollment_id,group_id,payer_user_id,policy_version` → `recreio.trial_enrollments` (restrict); `entitlement_id,group_id,entitlement_kind,entitlement_tier,starts_at,ends_at` → `recreio.entitlements` (restrict) | [schema](../../packages/db/src/schema/recreio-comercial.ts) |
| `trial_enrollments` | fatos comerciais e financeiros | `group_id,payer_user_id` → `recreio.groups` (restrict) | [schema](../../packages/db/src/schema/recreio-comercial.ts) |
| `visit_invite_guardian_approvals` | mundos e presença compartilhados | `invite_id,origin_profile_id,target_profile_id` → `recreio.space_visit_invites` (cascade); `guardian_link_id,profile_id` → `recreio.guardian_links` (cascade); `approved_by_user_id` → `core.users` (set null) | [schema](../../packages/db/src/schema/recreio-visitas.ts) |
| `visit_invite_world_approvals` | mundos e presença compartilhados | `invite_id,space_id` → `recreio.space_visit_invites` (cascade); `space_id,approved_by_member_id` → `recreio.space_members` (restrict); `approved_by_user_id` → `core.users` (set null); `guardian_link_id` → `recreio.guardian_links` (cascade) | [schema](../../packages/db/src/schema/recreio-visitas.ts) |
| `world_host_presences` | mundos e presença compartilhados | `space_id,host_member_id,host_profile_id` → `recreio.space_members` (restrict); `host_session_id,host_profile_id` → `recreio.game_sessions` (restrict); `space_id,fence` → `recreio.space_leases` (restrict); `instance_id` → `recreio.game_instances` (restrict) | [schema](../../packages/db/src/schema/recreio-presencas.ts) |
| `world_visit_sessions` | mundos e presença compartilhados | `session_id,profile_id` → `recreio.game_sessions` (restrict); `visit_id,space_id,profile_id` → `recreio.world_visits` (restrict) | [schema](../../packages/db/src/schema/recreio-visitas.ts) |
| `world_visits` | mundos e presença compartilhados | `invite_id,space_id,visitor_profile_id,host_presence_id` → `recreio.space_visit_invites` (restrict) | [schema](../../packages/db/src/schema/recreio-visitas.ts) |

## Implementação e lacunas

Os recortes de cadastro, inventário de jogos e dados pessoais por jogo estão
em candidata com gates próprios. Não abrangem ainda todos os vínculos acima.
O coordenador de exportação completa, artefato privado, download revogável,
consentimento de exclusão, congelamento, etapas retomáveis e adapter do mundo
permanecem pendentes. O domínio comercial retido continua separado da pessoa
jogadora. F7 não pode ser encerrado por este inventário.

Antes de qualquer escritor destrutivo, conferir os repositories consumidores
de cada export do schema e suas entradas por servidor/host/job. Uma lista de
imports ou FKs não substitui a revisão dos escritores e do I/O externo.


## Incremento candidato 0217

Após a base 0215 inventariada acima, 0216 acrescenta apenas a chave de conteúdo
na fotografia, e 0217 acrescenta `snapshot_object_deliveries`: agora são 64
tabelas Recreio e 142 FKs. [Schema do registro](../../packages/db/src/schema/recreio-objetos.ts).
Seu domínio é armazenamento/recuperação do mundo: envelope cifrado temporário,
referência à fotografia e destino técnico, lease, confirmação e recibo de
expurgo. Não é dado financeiro nem autorização para ler conteúdo.

O vínculo à fotografia usa FK restritiva por ID/mundo/SHA/tamanho. A retenção
precisa destacar o registro antes de excluir a fotografia e conservar o recibo
até confirmar o expurgo; encerramento não pode simplesmente apagar essa fila.
Corpos cifrados e objetos também precisam entrar na coordenação de privacidade.
Nenhum writer/worker novo foi habilitado por este incremento de schema.


## Incremento candidato 0218

O snapshot 0218, id `fb161f07-2b67-4ce4-b10d-bb489fc6b9e3`, acrescenta somente
`backup_captures` e `backup_object_holds`: 66 tabelas Recreio e 144 FKs.
[Schema](../../packages/db/src/schema/recreio-backup.ts) e
[proveniência intacta](evidencias/migracao-backup-reservas-0218.json).
Reservas possuem FKs RESTRICT para captura e entrega; nenhuma expiração ou
exclusão de fotografia apaga esses recibos. Conservar UUIDs/hashes técnicos
não é anonimização. Encerramento e replay de restauração precisam compor a
retirada com capturas e objetos retidos; não executar cascata a partir daqui.
Sem implantação ou escritor de captura nesta etapa.
