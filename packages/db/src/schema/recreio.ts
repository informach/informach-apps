import { type SQLWrapper, sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  customType,
  foreignKey,
  index,
  integer,
  jsonb,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./core";
import { recreioRightsOperations } from "./recreio-direitos-operacoes";
import { recreio } from "./recreio-namespace";

/**
 * Recreio, a plataforma de jogos. Só `apps/recreio` grava aqui; o servidor de
 * um jogo fala com o Recreio por HTTP e nunca lê estas tabelas.
 *
 * Fronteiras de exclusão:
 *
 * - **Identidade** (`groups`, perfis adultos): restringe a exclusão de
 *   `core.users` até o encerramento coordenado resolver seus vínculos.
 *   Aparelhos, ingressos, sessões e concessões seguem as FKs próprias.
 * - **Do mundo** (`spaces`, `space_members`, `space_invites`, `space_leases`,
 *   `space_snapshots`, `space_journal`): nenhuma cascata vinda de `core.users`
 *   as alcança. A referência ao perfil vira NULL e o mundo continua para os
 *   outros membros. Por isso `spaces` não tem FK para `core.users`, e tudo o
 *   que pertence a um mundo aponta para ele com `restrict`.
 */
export { recreio } from "./recreio-namespace";

const time = (name: string) => timestamp(name, { withTimezone: true }).defaultNow().notNull();
const moment = (name: string) => timestamp(name, { withTimezone: true });

/** Fotografia e diário de um mundo: bytes opacos, que só o jogo entende. */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

/**
 * Cursor das sessões de jogo encerradas. Cada sessão que termina recebe o
 * próximo valor em `game_sessions.ended_seq`; o batimento de uma instância
 * pede "o que terminou depois do meu cursor".
 */
export const recreioGameSessionEndSeq = recreio.sequence("game_session_end_seq");

/**
 * Grupo de assinatura: quem paga e os perfis que o plano cobre. O plano não
 * mora aqui: vem da cobrança (`billing.subscriptions`) e das concessões.
 */
export const recreioGroups = recreio.table(
  "groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: time("created_at"),
  },
  (t) => [
    uniqueIndex("recreio_groups_owner").on(t.ownerUserId),
    unique("recreio_group_owner_identity").on(t.id, t.ownerUserId),
  ],
);

/**
 * Quem joga. O jogo só conhece o `id` daqui, nunca o `user_id`. Um perfil
 * adulto é o da própria conta (um por conta); um perfil `minor` não tem login.
 */
const profileColumns = {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").references(() => users.id, { onDelete: "restrict" }),
  groupId: uuid("group_id").references(() => recreioGroups.id, { onDelete: "set null" }),
  /** O titular pode tirar um perfil da cobertura sem apagá-lo. */
  coverageEnabled: boolean("coverage_enabled").notNull().default(true),
  kind: text("kind").$type<"adult" | "minor">().notNull(),
  nickname: text("nickname").notNull(),
  avatar: text("avatar").notNull().default("padrao"),
  status: text("status").$type<"active" | "suspended">().notNull().default("active"),
  /** Sobe quando as permissões do perfil mudam; vai no token como `pv`. */
  policyVersion: integer("policy_version").notNull().default(1),
  createdAt: time("created_at"),
  updatedAt: time("updated_at"),
};

export const recreioProfiles = recreio.table(
  "profiles",
  {
    ...profileColumns,
    /** Barreira durável. Só a operação coordenada pode atualizar a projeção. */
    rightsOperationId: uuid("rights_operation_id").references(() => recreioRightsOperations.id, {
      onDelete: "restrict",
    }),
    rightsFrozenState: jsonb("rights_frozen_state").$type<unknown[]>(),
  },
  (t) => [
    check(
      "recreio_profiles_rights_freeze",
      sql`
      (${t.rightsOperationId} is null and ${t.rightsFrozenState} is null) or
      (${t.rightsOperationId} is not null and ${t.rightsFrozenState} is not null and
       ${t.status}='suspended' and ${t.rightsFrozenState}=${recreioRightsProfileProjection(t)})`,
    ),
    uniqueIndex("recreio_profiles_own_login").on(t.userId).where(sql`${t.userId} is not null`),
    unique("recreio_profile_identity_kind").on(t.id, t.kind),
    unique("recreio_profile_login_identity").on(t.id, t.userId),
    index("recreio_profiles_group").on(t.groupId),
    check("recreio_profiles_kind", sql`${t.kind} in ('adult', 'minor')`),
    // A retirada coordenada pode conservar só uma referência técnica suspensa
    // até vencer a retenção das presenças. Ela não conserva login ou cadastro.
    check(
      "recreio_profiles_adult_login",
      sql`
      ${t.kind}='minor' or ${t.userId} is not null or
      (${t.rightsOperationId} is not null and ${t.status}='suspended' and ${t.groupId} is null and
       ${t.coverageEnabled}=false and ${t.nickname}='Perfil retirado' and ${t.avatar}='padrao')`,
    ),
    check("recreio_profiles_nickname", sql`char_length(${t.nickname}) between 2 and 20`),
    check("recreio_profiles_status", sql`${t.status} in ('active', 'suspended')`),
    check("recreio_profiles_policy_version", sql`${t.policyVersion} >= 1`),
  ],
);

/**
 * Sessão de aparelho: o navegador em que alguém entrou e o perfil escolhido
 * nele. `account` nasce do login (uma por sessão do Better Auth, que fica no
 * Redis e por isso não tem FK); `paired_device` é o aparelho pareado.
 */
export const recreioDeviceSessions = recreio.table(
  "device_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").$type<"account" | "paired_device">().notNull(),
    authSessionId: text("auth_session_id"),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    activeProfileId: uuid("active_profile_id").references(() => recreioProfiles.id, {
      onDelete: "set null",
    }),
    profileSelectedAt: moment("profile_selected_at"),
    /** Trava de gestão independente do perfil/FK: excluir o menor não desbloqueia o adulto. */
    minorContextGeneration: uuid("minor_context_generation"),
    lastSeenAt: time("last_seen_at"),
    expiresAt: moment("expires_at").notNull(),
    revokedAt: moment("revoked_at"),
    createdAt: time("created_at"),
  },
  (t) => [
    uniqueIndex("recreio_device_sessions_auth_session")
      .on(t.authSessionId)
      .where(sql`${t.authSessionId} is not null`),
    index("recreio_device_sessions_user").on(t.userId),
    check("recreio_device_sessions_kind", sql`${t.kind} in ('account', 'paired_device')`),
    check(
      "recreio_device_sessions_account",
      sql`${t.kind} <> 'account' or (${t.authSessionId} is not null and ${t.userId} is not null)`,
    ),
  ],
);

/**
 * Concessão auditada do direito de jogar: cortesia da equipe ou período de
 * teste. Nunca é apagada nem editada; revogar preenche `revoked_at`.
 */
export const recreioEntitlements = recreio.table(
  "entitlements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => recreioGroups.id, { onDelete: "cascade" }),
    kind: text("kind").$type<"courtesy" | "trial">().notNull(),
    tier: text("tier").$type<"individual" | "family">().notNull(),
    startsAt: moment("starts_at").notNull(),
    endsAt: moment("ends_at").notNull(),
    /** Código curto do motivo, nunca texto livre. */
    reasonCode: text("reason_code").notNull(),
    grantedByUserId: text("granted_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    revokedAt: moment("revoked_at"),
    revokedByUserId: text("revoked_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    revokeReasonCode: text("revoke_reason_code"),
    createdAt: time("created_at"),
  },
  (t) => [
    index("recreio_entitlements_group").on(t.groupId, t.endsAt),
    unique("recreio_entitlement_trial_identity").on(
      t.id,
      t.groupId,
      t.kind,
      t.tier,
      t.startsAt,
      t.endsAt,
    ),
    check("recreio_entitlements_kind", sql`${t.kind} in ('courtesy', 'trial')`),
    check("recreio_entitlements_tier", sql`${t.tier} in ('individual', 'family')`),
    check("recreio_entitlements_period", sql`${t.endsAt} > ${t.startsAt}`),
    check("recreio_entitlements_reason", sql`${t.reasonCode} ~ '^[a-z0-9_]{2,40}$'`),
    check(
      "recreio_entitlements_revoke_reason",
      sql`${t.revokeReasonCode} is null or (${t.revokedAt} is not null and ${t.revokeReasonCode} ~ '^[a-z0-9_]{2,40}$')`,
    ),
  ],
);

/**
 * Mundo (GameSpace). Não tem FK para `core.users`: quando uma conta é
 * excluída, o mundo fica para os outros membros e o responsável vira NULL até
 * a sucessão escolher outro.
 */
const spaceColumns = {
  id: uuid("id").primaryKey().defaultRandom(),
  gameId: text("game_id").notNull(),
  stewardProfileId: uuid("steward_profile_id").references(() => recreioProfiles.id, {
    onDelete: "set null",
  }),
  createdByProfileId: uuid("created_by_profile_id").references(() => recreioProfiles.id, {
    onDelete: "set null",
  }),
  name: text("name").notNull(),
  contentPolicy: text("content_policy").notNull(),
  membersInvite: text("members_invite")
    .$type<"no" | "with_approval" | "yes">()
    .notNull()
    .default("with_approval"),
  status: text("status")
    .$type<"active" | "hibernating" | "archived" | "deleted">()
    .notNull()
    .default("hibernating"),
  schemaVersion: integer("schema_version").notNull().default(1),
  /** Conta as fotografias gravadas. */
  revision: integer("revision").notNull().default(0),
  /** Última entrada do diário, sem buracos. */
  journalSeq: bigint("journal_seq", { mode: "number" }).notNull().default(0),
  /** Última cerca emitida para este mundo; só cresce. */
  leaseEpoch: integer("lease_epoch").notNull().default(0),
  /** Revisão da gestão, independente das fotografias e da posse do servidor. */
  managementRevision: integer("management_revision").notNull().default(1),
  /** Só o arquivamento explícito preenche; registros legados podem não ter data. */
  archivedAt: moment("archived_at"),
  /** Resumo que o jogo publica para a tela de mundos; nunca o estado em si. */
  summary: jsonb("summary").$type<Record<string, unknown>>(),
  createdAt: time("created_at"),
  updatedAt: time("updated_at"),
};

export const recreioSpaces = recreio.table(
  "spaces",
  {
    ...spaceColumns,
    /** Barreira durável. Só a operação coordenada pode atualizar a projeção. */
    rightsOperationId: uuid("rights_operation_id").references(() => recreioRightsOperations.id, {
      onDelete: "restrict",
    }),
    rightsFrozenState: jsonb("rights_frozen_state").$type<unknown[]>(),
    rightsDraining: boolean("rights_draining").notNull().default(false),
  },
  (t) => [
    check(
      "recreio_spaces_rights_freeze",
      sql`
      (${t.rightsOperationId} is null and ${t.rightsFrozenState} is null and not ${t.rightsDraining}) or
      (${t.rightsOperationId} is not null and ${t.rightsFrozenState} is not null and
       ${t.status}='archived' and not ${t.rightsDraining} and ${t.rightsFrozenState}=${recreioRightsWorldProjection(t)}) or
      (${t.rightsOperationId} is not null and ${t.rightsFrozenState} is not null and
       ${t.status}='archived' and ${t.rightsDraining} and ${t.rightsFrozenState}=${recreioRightsWorldDrainingProjection(t)})`,
    ),
    index("recreio_spaces_steward").on(t.stewardProfileId),
    index("recreio_spaces_creator").on(t.createdByProfileId),
    check("recreio_spaces_name", sql`char_length(${t.name}) between 2 and 40`),
    check(
      "recreio_spaces_members_invite",
      sql`${t.membersInvite} in ('no', 'with_approval', 'yes')`,
    ),
    check(
      "recreio_spaces_status",
      sql`${t.status} in ('active', 'hibernating', 'archived', 'deleted')`,
    ),
    check(
      "recreio_spaces_counters",
      sql`${t.schemaVersion} >= 1 and ${t.revision} >= 0 and ${t.journalSeq} >= 0 and ${t.leaseEpoch} >= 0`,
    ),
    check("recreio_spaces_management_revision", sql`${t.managementRevision} >= 1`),
  ],
);

/** Ingresso: nasce no portal, vale 60 s e é consumido uma vez na troca pela sessão. */
export const recreioGameTickets = recreio.table(
  "game_tickets",
  {
    /** O emissor escolhe o `jti` e o assina no token; o banco não sorteia. */
    jti: uuid("jti").primaryKey(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => recreioProfiles.id, { onDelete: "cascade" }),
    deviceSessionId: uuid("device_session_id")
      .notNull()
      .references(() => recreioDeviceSessions.id, { onDelete: "cascade" }),
    gameId: text("game_id").notNull(),
    issuedAt: time("issued_at"),
    expiresAt: moment("expires_at").notNull(),
    consumedAt: moment("consumed_at"),
    /** Prova opaca do pedido, somente hash; permite recuperar a mesma resposta. */
    exchangeKeyHash: text("exchange_key_hash"),
    openedSessionId: uuid("opened_session_id"),
  },
  (t) => [
    index("recreio_game_tickets_profile_history").on(t.profileId, t.jti),
    index("recreio_game_tickets_expires").on(t.expiresAt),
    foreignKey({
      name: "recreio_ticket_opened_session_profile",
      columns: [t.openedSessionId, t.profileId],
      foreignColumns: [recreioGameSessions.id, recreioGameSessions.profileId],
    }).onDelete("cascade"),
    uniqueIndex("recreio_ticket_opened_session")
      .on(t.openedSessionId)
      .where(sql`${t.openedSessionId} is not null`),
    check(
      "recreio_ticket_opened_receipt",
      sql`${t.openedSessionId} is null or ${t.consumedAt} is not null`,
    ),
    check(
      "recreio_ticket_exchange_key",
      sql`${t.exchangeKeyHash} is null or (${t.consumedAt} is not null and ${t.openedSessionId} is not null and ${t.exchangeKeyHash} ~ '^[0-9a-f]{64}$')`,
    ),
    index("recreio_game_tickets_pending_profile")
      .on(t.profileId, t.expiresAt)
      .where(sql`${t.consumedAt} is null`),
    index("recreio_game_tickets_pending_device")
      .on(t.deviceSessionId, t.expiresAt)
      .where(sql`${t.consumedAt} is null`),
  ],
);

/** Sessão de jogo: o `id` é a claim `sid`. Um perfil joga uma coisa por vez. */
export const recreioGameSessions = recreio.table(
  "game_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => recreioProfiles.id, { onDelete: "cascade" }),
    deviceSessionId: uuid("device_session_id")
      .notNull()
      .references(() => recreioDeviceSessions.id, { onDelete: "cascade" }),
    gameId: text("game_id").notNull(),
    spaceId: uuid("space_id").references(() => recreioSpaces.id, { onDelete: "set null" }),
    /** Negociação inicial do cliente; um SID legado nunca ganha visitas por atualização. */
    supportsVisits: boolean("supports_visits").notNull().default(false),
    startedAt: time("started_at"),
    lastRenewedAt: time("last_renewed_at"),
    /** Barreira do checkpoint: nunca é removida para reativar o mesmo SID. */
    checkpointFrozenAt: moment("checkpoint_frozen_at"),
    /** Contato de controle, separado de renovar a concessão de jogo. */
    controlSeenAt: moment("control_seen_at"),
    expiresAt: moment("expires_at").notNull(),
    endedAt: moment("ended_at"),
    endReason: text("end_reason").$type<
      "left" | "replaced" | "access_lost" | "signed_out" | "expired" | "permissions_changed"
    >(),
    /** Preenchido com `nextval('recreio.game_session_end_seq')` ao encerrar. */
    endedSeq: bigint("ended_seq", { mode: "number" }),
  },
  (t) => [
    uniqueIndex("recreio_game_sessions_one_open").on(t.profileId).where(sql`${t.endedAt} is null`),
    unique("recreio_game_session_identity_profile").on(t.id, t.profileId),
    index("recreio_game_sessions_ended_seq").on(t.endedSeq).where(sql`${t.endedSeq} is not null`),
    index("recreio_game_sessions_profile_ended").on(t.profileId, t.endedSeq),
    check(
      "recreio_game_sessions_end_reason",
      sql`${t.endReason} is null or ${t.endReason} in ('left', 'replaced', 'access_lost', 'signed_out', 'expired', 'permissions_changed')`,
    ),
    // Sessão encerrada sempre entra no cursor: sem isso uma instância nunca
    // saberia que ela acabou.
    check(
      "recreio_game_sessions_ended",
      sql`(${t.endedAt} is null and ${t.endReason} is null and ${t.endedSeq} is null) or (${t.endedAt} is not null and ${t.endReason} is not null and ${t.endedSeq} is not null)`,
    ),
  ],
);

/**
 * Participação de um perfil em um mundo. Nunca é apagada: quem sai vira
 * `former`, e a conta excluída deixa a linha com `profile_id` NULL.
 */
export const recreioSpaceMembers = recreio.table(
  "space_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => recreioSpaces.id, { onDelete: "restrict" }),
    profileId: uuid("profile_id").references(() => recreioProfiles.id, { onDelete: "set null" }),
    role: text("role").$type<"steward" | "coadmin" | "member">().notNull(),
    state: text("state").$type<"active" | "no_access" | "away" | "former">().notNull(),
    /** Texto opaco do jogo (ex.: de que família o membro participa). */
    participation: text("participation"),
    invitedByMemberId: uuid("invited_by_member_id"),
    joinedAt: time("joined_at"),
    leftAt: moment("left_at"),
  },
  (t) => [
    uniqueIndex("recreio_space_members_profile").on(t.spaceId, t.profileId),
    unique("recreio_space_members_space_id").on(t.spaceId, t.id),
    unique("recreio_space_members_identity_profile").on(t.spaceId, t.id, t.profileId),
    foreignKey({
      name: "recreio_space_members_inviter_world_fk",
      columns: [t.spaceId, t.invitedByMemberId],
      foreignColumns: [t.spaceId, t.id],
    }).onDelete("restrict"),
    index("recreio_space_members_by_profile").on(t.profileId, t.state),
    check("recreio_space_members_role", sql`${t.role} in ('steward', 'coadmin', 'member')`),
    check(
      "recreio_space_members_state",
      sql`${t.state} in ('active', 'no_access', 'away', 'former')`,
    ),
    check(
      "recreio_space_members_participation",
      sql`${t.participation} is null or char_length(${t.participation}) <= 64`,
    ),
  ],
);

/** Convite para um mundo. O código existe só na tela de quem convidou; aqui fica o resumo. */
export const recreioSpaceInvites = recreio.table(
  "space_invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => recreioSpaces.id, { onDelete: "restrict" }),
    invitedByMemberId: uuid("invited_by_member_id").notNull(),
    form: text("form").$type<"member" | "visit">().notNull(),
    participation: text("participation"),
    codeHash: text("code_hash").notNull(),
    targetProfileId: uuid("target_profile_id").references(() => recreioProfiles.id, {
      onDelete: "set null",
    }),
    state: text("state")
      .$type<"pending_approval" | "sent" | "accepted" | "expired" | "revoked">()
      .notNull(),
    expiresAt: moment("expires_at").notNull(),
    acceptedAt: moment("accepted_at"),
    acceptedByProfileId: uuid("accepted_by_profile_id").references(() => recreioProfiles.id, {
      onDelete: "set null",
    }),
    createdAt: time("created_at"),
  },
  (t) => [
    uniqueIndex("recreio_space_invites_code").on(t.codeHash),
    foreignKey({
      name: "recreio_space_invites_inviter_world_fk",
      columns: [t.spaceId, t.invitedByMemberId],
      foreignColumns: [recreioSpaceMembers.spaceId, recreioSpaceMembers.id],
    }).onDelete("restrict"),
    index("recreio_space_invites_space").on(t.spaceId, t.state),
    index("recreio_space_invites_unused_expires")
      .on(t.expiresAt, t.id)
      .where(sql`${t.state} <> 'accepted'`),
    check("recreio_space_invites_form", sql`${t.form} in ('member', 'visit')`),
    check(
      "recreio_space_invites_state",
      sql`${t.state} in ('pending_approval', 'sent', 'accepted', 'expired', 'revoked')`,
    ),
    check(
      "recreio_space_invites_participation",
      sql`${t.participation} is null or char_length(${t.participation}) <= 64`,
    ),
  ],
);

/** Oferta de responsabilidade: não concede autoridade antes do aceite do destinatário. */
export const recreioSpaceStewardshipRequests = recreio.table(
  "space_stewardship_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => recreioSpaces.id, { onDelete: "restrict" }),
    fromMemberId: uuid("from_member_id").notNull(),
    toMemberId: uuid("to_member_id").notNull(),
    state: text("state")
      .$type<"pending" | "accepted" | "declined" | "revoked" | "expired">()
      .notNull()
      .default("pending"),
    createdAt: time("created_at"),
    expiresAt: moment("expires_at").notNull(),
    completedAt: moment("completed_at"),
  },
  (t) => [
    foreignKey({
      name: "recreio_stewardship_from_member_world_fk",
      columns: [t.spaceId, t.fromMemberId],
      foreignColumns: [recreioSpaceMembers.spaceId, recreioSpaceMembers.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "recreio_stewardship_to_member_world_fk",
      columns: [t.spaceId, t.toMemberId],
      foreignColumns: [recreioSpaceMembers.spaceId, recreioSpaceMembers.id],
    }).onDelete("restrict"),
    uniqueIndex("recreio_stewardship_pending_world")
      .on(t.spaceId)
      .where(sql`${t.state} = 'pending'`),
    index("recreio_stewardship_recipient_pending")
      .on(t.toMemberId, t.id)
      .where(sql`${t.state} = 'pending'`),
    check("recreio_stewardship_distinct_members", sql`${t.fromMemberId} <> ${t.toMemberId}`),
    check(
      "recreio_stewardship_state",
      sql`${t.state} in ('pending', 'accepted', 'declined', 'revoked', 'expired')`,
    ),
    check(
      "recreio_stewardship_completion",
      sql`
      (${t.state} = 'pending' and ${t.completedAt} is null)
      or (${t.state} <> 'pending' and ${t.completedAt} is not null)`,
    ),
    check("recreio_stewardship_expiry", sql`${t.expiresAt} > ${t.createdAt}`),
    check(
      "recreio_stewardship_completion_time",
      sql`${t.completedAt} is null or ${t.completedAt} >= ${t.createdAt}`,
    ),
    check(
      "recreio_stewardship_acceptance_time",
      sql`${t.state} <> 'accepted' or ${t.completedAt} < ${t.expiresAt}`,
    ),
    check(
      "recreio_stewardship_expiration_time",
      sql`${t.state} <> 'expired' or ${t.completedAt} >= ${t.expiresAt}`,
    ),
  ],
);

/** Instância de um servidor de jogo, registrada pela API das instâncias. */
export const recreioGameInstances = recreio.table(
  "game_instances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gameId: text("game_id").notNull(),
    publicUrl: text("public_url").notNull(),
    version: text("version").notNull(),
    /** Capacidade declarada no registro; instâncias legadas permanecem sem visitas. */
    supportsVisits: boolean("supports_visits").notNull().default(false),
    state: text("state").$type<"active" | "draining" | "gone">().notNull().default("active"),
    /** Quantos mundos a instância aceita ao mesmo tempo. */
    capacity: integer("capacity").notNull(),
    startedAt: time("started_at"),
    lastSeenAt: time("last_seen_at"),
  },
  (t) => [
    index("recreio_game_instances_pick").on(t.gameId, t.state, t.lastSeenAt),
    check("recreio_game_instances_state", sql`${t.state} in ('active', 'draining', 'gone')`),
    check("recreio_game_instances_capacity", sql`${t.capacity} > 0`),
  ],
);

/**
 * Posse: quem executa um mundo agora. `fence` é a cerca, que só cresce por
 * mundo; toda escrita do jogo é conferida contra a posse aberta, na mesma
 * transação. O índice parcial garante uma posse aberta por mundo.
 */
export const recreioSpaceLeases = recreio.table(
  "space_leases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => recreioSpaces.id, { onDelete: "restrict" }),
    fence: integer("fence").notNull(),
    holderKind: text("holder_kind").$type<"server" | "offline" | "browser">().notNull(),
    instanceId: uuid("instance_id").references(() => recreioGameInstances.id, {
      onDelete: "set null",
    }),
    state: text("state").$type<"assigned" | "held" | "released">().notNull(),
    acquiredAt: time("acquired_at"),
    claimedAt: moment("claimed_at"),
    expiresAt: moment("expires_at").notNull(),
    releasedAt: moment("released_at"),
    endReason: text("end_reason").$type<"empty" | "drain" | "error" | "expired" | "taken_over">(),
    peakPlayers: integer("peak_players").notNull().default(0),
    playerSeconds: bigint("player_seconds", { mode: "number" }).notNull().default(0),
  },
  (t) => [
    uniqueIndex("recreio_space_leases_fence").on(t.spaceId, t.fence),
    uniqueIndex("recreio_space_leases_one_open").on(t.spaceId).where(sql`${t.releasedAt} is null`),
    index("recreio_space_leases_expiring").on(t.expiresAt).where(sql`${t.releasedAt} is null`),
    check(
      "recreio_space_leases_holder_kind",
      sql`${t.holderKind} in ('server', 'offline', 'browser')`,
    ),
    check("recreio_space_leases_state", sql`${t.state} in ('assigned', 'held', 'released')`),
    check(
      "recreio_space_leases_end_reason",
      sql`${t.endReason} is null or ${t.endReason} in ('empty', 'drain', 'error', 'expired', 'taken_over')`,
    ),
    // O índice "uma posse aberta" olha `released_at`; o estado não pode dizer outra coisa.
    check(
      "recreio_space_leases_released",
      sql`(${t.state} = 'released') = (${t.releasedAt} is not null)`,
    ),
    check(
      "recreio_space_leases_counters",
      sql`${t.fence} >= 0 and ${t.peakPlayers} >= 0 and ${t.playerSeconds} >= 0`,
    ),
  ],
);

/**
 * Fotografia do mundo. Hoje os bytes ficam no Postgres (`storage = 'pg'`); as
 * colunas para um bucket já existem, e uma linha nunca usa os dois.
 */
export const recreioSpaceSnapshots = recreio.table(
  "space_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => recreioSpaces.id, { onDelete: "restrict" }),
    revision: integer("revision").notNull(),
    fence: integer("fence").notNull(),
    schemaVersion: integer("schema_version").notNull(),
    /** Última entrada do diário que a fotografia já contém. */
    journalSeq: bigint("journal_seq", { mode: "number" }).notNull(),
    tick: bigint("tick", { mode: "number" }).notNull(),
    kind: text("kind").$type<"checkpoint" | "hibernate" | "pinned">().notNull(),
    storage: text("storage").$type<"pg" | "bucket">().notNull(),
    data: bytea("data"),
    objectKey: text("object_key"),
    byteSize: integer("byte_size").notNull(),
    sha256: text("sha256").notNull(),
    createdAt: time("created_at"),
  },
  (t) => [
    uniqueIndex("recreio_space_snapshots_revision").on(t.spaceId, t.revision),
    // O registro aditivo de objetos deve comprovar fotografia, mundo e conteúdo.
    // Gerar/adotar esta chave antes de gerar as FKs da nova tabela de objetos.
    unique("recreio_snapshot_content_identity").on(t.id, t.spaceId, t.sha256, t.byteSize),
    check("recreio_space_snapshots_kind", sql`${t.kind} in ('checkpoint', 'hibernate', 'pinned')`),
    check(
      "recreio_space_snapshots_storage",
      sql`(${t.storage} = 'pg' and ${t.data} is not null and ${t.objectKey} is null) or (${t.storage} = 'bucket' and ${t.objectKey} is not null and ${t.data} is null)`,
    ),
    check("recreio_space_snapshots_sha256", sql`${t.sha256} ~ '^[0-9a-f]{64}$'`),
    check(
      "recreio_space_snapshots_counters",
      sql`${t.revision} >= 0 and ${t.fence} >= 0 and ${t.journalSeq} >= 0 and ${t.tick} >= 0 and ${t.byteSize} >= 0`,
    ),
  ],
);

/**
 * Diário do mundo: os fatos desde a última fotografia, em ordem e sem buracos.
 * `fact_id` é determinístico, então o mesmo fato nunca entra duas vezes.
 */
export const recreioSpaceJournal = recreio.table(
  "space_journal",
  {
    spaceId: uuid("space_id")
      .notNull()
      .references(() => recreioSpaces.id, { onDelete: "restrict" }),
    seq: bigint("seq", { mode: "number" }).notNull(),
    fence: integer("fence").notNull(),
    tick: bigint("tick", { mode: "number" }).notNull(),
    factId: text("fact_id").notNull(),
    payload: bytea("payload").notNull(),
    byteSize: integer("byte_size").notNull(),
    createdAt: time("created_at"),
  },
  (t) => [
    primaryKey({ columns: [t.spaceId, t.seq] }),
    uniqueIndex("recreio_space_journal_fact").on(t.spaceId, t.factId),
    check(
      "recreio_space_journal_counters",
      sql`${t.seq} >= 1 and ${t.fence} >= 0 and ${t.tick} >= 0 and ${t.byteSize} >= 0`,
    ),
    check("recreio_space_journal_fact_id", sql`char_length(${t.factId}) between 1 and 160`),
  ],
);

export type RecreioProfile = typeof recreioProfiles.$inferSelect;
export type RecreioDeviceSession = typeof recreioDeviceSessions.$inferSelect;
export type RecreioEntitlement = typeof recreioEntitlements.$inferSelect;

/** Projeções privadas do congelamento. Epoch numérico evita depender do timezone
 * da conexão. updatedAt é só manutenção técnica; createdAt e archivedAt também
 * governam retenção e, portanto, fazem parte da proteção. */
export function recreioRightsProfileProjection(
  v: Record<Exclude<keyof typeof profileColumns, "updatedAt">, SQLWrapper>,
) {
  const fields = {
    id: sql`${v.id}::uuid`,
    userId: sql`${v.userId}::text`,
    groupId: sql`${v.groupId}::uuid`,
    coverageEnabled: sql`${v.coverageEnabled}::boolean`,
    kind: sql`${v.kind}::text`,
    nickname: sql`${v.nickname}::text`,
    avatar: sql`${v.avatar}::text`,
    status: sql`${v.status}::text`,
    policyVersion: sql`${v.policyVersion}::integer`,
    createdAt: sql`extract(epoch from ${v.createdAt}::timestamptz)`,
  } satisfies Record<Exclude<keyof typeof profileColumns, "updatedAt">, SQLWrapper>;
  return sql`jsonb_build_array(${sql.join(Object.values(fields), sql`, `)})`;
}

export function recreioRightsWorldProjection(
  v: Record<Exclude<keyof typeof spaceColumns, "updatedAt">, SQLWrapper>,
) {
  const fields = {
    id: sql`${v.id}::uuid`,
    gameId: sql`${v.gameId}::text`,
    stewardProfileId: sql`${v.stewardProfileId}::uuid`,
    createdByProfileId: sql`${v.createdByProfileId}::uuid`,
    name: sql`${v.name}::text`,
    contentPolicy: sql`${v.contentPolicy}::text`,
    membersInvite: sql`${v.membersInvite}::text`,
    status: sql`${v.status}::text`,
    schemaVersion: sql`${v.schemaVersion}::integer`,
    revision: sql`${v.revision}::integer`,
    journalSeq: sql`${v.journalSeq}::bigint`,
    leaseEpoch: sql`${v.leaseEpoch}::integer`,
    managementRevision: sql`${v.managementRevision}::integer`,
    archivedAt: sql`extract(epoch from ${v.archivedAt}::timestamptz)`,
    summary: sql`${v.summary}::jsonb`,
    createdAt: sql`extract(epoch from ${v.createdAt}::timestamptz)`,
  } satisfies Record<Exclude<keyof typeof spaceColumns, "updatedAt">, SQLWrapper>;
  return sql`jsonb_build_array(${sql.join(Object.values(fields), sql`, `)})`;
}

/** Na drenagem só o checkpoint da posse atual pode avançar os campos
 * de persistência. Identidade, cerca e gestão permanecem imutáveis. O status
 * archived fecha os gateways existentes sem mudar o contrato do host. */
export function recreioRightsWorldDrainingProjection(
  v: Record<Exclude<keyof typeof spaceColumns, "updatedAt">, SQLWrapper>,
) {
  return recreioRightsWorldProjection({
    ...v,
    schemaVersion: sql`0`,
    revision: sql`0`,
    journalSeq: sql`0`,
    summary: sql`null`,
  });
}
