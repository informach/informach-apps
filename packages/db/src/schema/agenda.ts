import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  date,
  index,
  integer,
  pgSchema,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./core";

// Dias da semana em que uma matéria ocorre. v1 cobre só Seg-Sex (escolas
// brasileiras tipicamente não têm aula sábado/domingo). Se um dia chegar
// pelo parser de IA fora desse range, o check constraint do Postgres trava
// no insert/update — defesa em camadas além da validação Zod.
export const AGENDA_CLASS_DAYS = ["mon", "tue", "wed", "thu", "fri"] as const;
export type AgendaClassDay = (typeof AGENDA_CLASS_DAYS)[number];

// Extracurriculares (jazz, futebol, natação) pertencem ao perfil — não à
// turma — então rodam qualquer dia da semana, inclusive sábado/domingo.
// Mantemos o array `AGENDA_CLASS_DAYS` (Seg-Sex) intacto pro domínio escolar.
export const AGENDA_EXTRACURRICULAR_DAYS = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
] as const;
export type AgendaExtracurricularDay = (typeof AGENDA_EXTRACURRICULAR_DAYS)[number];

// Estado de uma matéria extracurricular. `paused` é reversível — UI esconde
// das vistas "matérias do dia" e do calendário, mas mantém row + atividades
// pra retomar depois (criança que dá um break de 3 meses no jazz e volta).
export const AGENDA_PROFILE_SUBJECT_STATUSES = ["active", "paused"] as const;
export type AgendaProfileSubjectStatus = (typeof AGENDA_PROFILE_SUBJECT_STATUSES)[number];

export const agenda = pgSchema("agenda");

export const agendaPlaceholderEntries = agenda.table("placeholder_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ----- Reference data: IBGE states + cities + INEP schools -----

export const agendaStates = agenda.table("states", {
  uf: text("uf").primaryKey(),
  ibgeCode: text("ibge_code").notNull().unique(),
  name: text("name").notNull(),
});

export const agendaCities = agenda.table(
  "cities",
  {
    ibgeCode: text("ibge_code").primaryKey(),
    stateUf: text("state_uf")
      .notNull()
      .references(() => agendaStates.uf),
    name: text("name").notNull(),
  },
  (t) => [index("agenda_cities_state_name_idx").on(t.stateUf, t.name)],
);

export const agendaSchools = agenda.table(
  "schools",
  {
    inepCode: text("inep_code").primaryKey(),
    cityIbgeCode: text("city_ibge_code")
      .notNull()
      .references(() => agendaCities.ibgeCode),
    name: text("name").notNull(),
  },
  (t) => [index("agenda_schools_city_name_idx").on(t.cityIbgeCode, t.name)],
);

// ----- Turmas (shared across accounts) -----

export const agendaTurmas = agenda.table(
  "turmas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull().unique(),
    schoolInepCode: text("school_inep_code")
      .notNull()
      .references(() => agendaSchools.inepCode),
    grade: text("grade", {
      enum: ["1ano", "2ano", "3ano", "4ano", "5ano", "6ano", "7ano", "8ano", "9ano"],
    }).notNull(),
    year: integer("year").notNull(),
    shift: text("shift", { enum: ["unspecified", "morning", "afternoon", "full_day", "evening"] })
      .notNull()
      .default("unspecified"),
    classLetter: text("class_letter").notNull(),
    createdByUserId: text("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("agenda_turmas_owner_key_idx").on(
      t.schoolInepCode,
      t.grade,
      t.year,
      t.classLetter,
      t.shift,
      t.createdByUserId,
    ),
  ],
);

export const agendaStudentProfiles = agenda.table(
  "student_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    birthDate: date("birth_date"),
    activeTurmaId: uuid("active_turma_id").references((): AnyPgColumn => agendaTurmas.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("agenda_student_profiles_user_created_idx").on(t.userId, t.createdAt)],
);

export const agendaTurmaMembers = agenda.table(
  "turma_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    turmaId: uuid("turma_id")
      .notNull()
      .references(() => agendaTurmas.id, { onDelete: "cascade" }),
    studentProfileId: uuid("student_profile_id")
      .notNull()
      .references(() => agendaStudentProfiles.id, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("agenda_turma_members_unique_idx").on(t.turmaId, t.studentProfileId),
    index("agenda_turma_members_profile_idx").on(t.studentProfileId),
  ],
);

// Matérias pertencem à turma (compartilhadas entre famílias). Só o creator da
// turma edita/exclui — checagem é no service. UNIQUE (turma_id, name) impede
// duplicata exata na mesma turma.
export const agendaSubjects = agenda.table(
  "subjects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    turmaId: uuid("turma_id")
      .notNull()
      .references(() => agendaTurmas.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    teacherName: text("teacher_name"),
    // Cor visual atribuída no momento do INSERT, 1..5 (chart-1..chart-5).
    // Escolha free-of-collision por turma feita no repository sob pg_advisory_xact_lock.
    colorIndex: smallint("color_index").notNull().default(1),
    // Dias da semana em que a matéria tem aula. Vazio significa "horário não
    // cadastrado". Usado pelo fallback de dueAt no parser de atividades de IA:
    // quando a atividade vem sem data e o subject foi resolvido, calcula a
    // próxima data que casa com algum dia daqui. v1 só Seg-Sex (`AGENDA_CLASS_DAYS`).
    classDays: text("class_days")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`)
      .$type<AgendaClassDay[]>(),
    createdByUserId: text("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("agenda_subjects_turma_name_unique_idx").on(t.turmaId, t.name),
    index("agenda_subjects_turma_idx").on(t.turmaId),
    check(
      "agenda_subjects_class_days_valid",
      sql`${t.classDays} <@ ARRAY['mon','tue','wed','thu','fri']::text[]`,
    ),
  ],
);

// Slots de revezamento quinzenal: marca que UMA matéria reveza num DIA
// específico com OUTRA matéria, alternando a cada 7 dias. Cobre os casos:
//   - Artes ↔ ACC na quarta (cada uma com classDays=[wed], slot pra wed).
//   - Matemática [mon,tue,wed,fri] ↔ Robótica [fri] só no fri.
// Sem linha pra `(subject, day)` ⇒ esse dia é semanal (comportamento default,
// matches o que `classDays` já modela hoje). Com linha ⇒ esse dia é
// quinzenal, e a paridade é calculada contra `anchor_date`.
// Bidirecionalidade: o service garante que existe linha-espelho na matéria
// pareada. Db-level constraint só impõe (subject_id, day) único — não tenta
// validar a outra direção (overhead transacional).
export const agendaSubjectAlternatingSlots = agenda.table(
  "subject_alternating_slots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subjectId: uuid("subject_id")
      .notNull()
      .references((): AnyPgColumn => agendaSubjects.id, { onDelete: "cascade" }),
    dayOfWeek: text("day_of_week").notNull().$type<AgendaClassDay>(),
    pairedSubjectId: uuid("paired_subject_id")
      .notNull()
      .references((): AnyPgColumn => agendaSubjects.id, { onDelete: "cascade" }),
    // Data conhecida em que ESTA matéria teve aula nesse `dayOfWeek`.
    // Qualquer outra data X: `floor((X - anchorDate) / 7d) % 2 === 0` ⇒ é
    // semana "minha"; senão ⇒ é semana do par. TZ-agnostic (string "YYYY-MM-DD"
    // tratada como dia local America/Sao_Paulo). Service valida que
    // `getDay(anchor_date) === dayOfWeek` antes do insert.
    anchorDate: date("anchor_date").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("agenda_subject_alt_slots_subject_day_idx").on(t.subjectId, t.dayOfWeek),
    index("agenda_subject_alt_slots_paired_idx").on(t.pairedSubjectId),
    check(
      "agenda_subject_alt_slots_day_valid",
      sql`${t.dayOfWeek} IN ('mon','tue','wed','thu','fri')`,
    ),
    check("agenda_subject_alt_slots_diff_subject", sql`${t.subjectId} <> ${t.pairedSubjectId}`),
  ],
);

// Atividades (tarefa/prova/trabalho/lembrete) pertencem à turma. Status é
// individual por perfil (tabela separada) — uma atividade compartilhada não
// tem "status global", cada perfil de cada família tem o seu próprio rastro.
// Edit/delete só pelo criador; bloqueado quando outra família já aceitou.
export const agendaActivities = agenda.table(
  "activities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    turmaId: uuid("turma_id")
      .notNull()
      .references(() => agendaTurmas.id, { onDelete: "cascade" }),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => agendaSubjects.id, { onDelete: "cascade" }),
    createdByUserId: text("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    type: text("type", {
      enum: ["task", "exam", "project", "reminder"],
    }).notNull(),
    visibility: text("visibility", {
      enum: ["individual", "shared_with_turma"],
    })
      .notNull()
      .default("individual"),
    title: text("title").notNull(),
    description: text("description"),
    // Só a data (sem hora nem timezone) — atividades escolares são "entrega no
    // dia X". Drizzle mode default devolve string "YYYY-MM-DD", igual
    // student_profiles.birthDate.
    dueAt: date("due_at").notNull(),
    version: integer("version").notNull().default(1),
    canceledAt: timestamp("canceled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("agenda_activities_turma_due_idx").on(t.turmaId, t.dueAt),
    index("agenda_activities_creator_due_idx").on(t.createdByUserId, t.dueAt),
    // Suporta `isSubjectInUseByOtherUsers` no service de matérias.
    index("agenda_activities_subject_idx").on(t.subjectId),
  ],
);

// Status individual por perfil. Quando a atividade é criada, geramos uma row
// por perfil ativo do criador na turma. Quando outro usuário Pro aceita a
// atividade compartilhada, geramos rows pros perfis ativos dele na turma.
// `done` é terminal mas reversível (user pode marcar como pending de novo).
export const agendaActivityStatuses = agenda.table(
  "activity_statuses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    activityId: uuid("activity_id")
      .notNull()
      .references(() => agendaActivities.id, { onDelete: "cascade" }),
    studentProfileId: uuid("student_profile_id")
      .notNull()
      .references(() => agendaStudentProfiles.id, { onDelete: "cascade" }),
    status: text("status", {
      enum: ["pending", "done"],
    })
      .notNull()
      .default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("agenda_activity_statuses_unique_idx").on(t.activityId, t.studentProfileId),
    index("agenda_activity_statuses_profile_idx").on(t.studentProfileId, t.status),
  ],
);

// Aceite/rejeite de atividade compartilhada por outro user (não-creator) da
// turma. O criador NÃO tem row aqui — aceite implícito. `accepted=true`
// gera status rows pros perfis ativos do user; `accepted=false` apenas
// silencia o widget de aceitação no dashboard.
export const agendaActivityAcceptances = agenda.table(
  "activity_acceptances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    activityId: uuid("activity_id")
      .notNull()
      .references(() => agendaActivities.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accepted: boolean("accepted").notNull(),
    respondedAt: timestamp("responded_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("agenda_activity_acceptances_unique_idx").on(t.activityId, t.userId),
    index("agenda_activity_acceptances_user_idx").on(t.userId, t.accepted),
  ],
);

// ----- Extracurriculares (donas: perfis individuais) -----
//
// Diferente de `agenda.subjects` (que pertence à turma e é compartilhada
// entre famílias), `agenda.profile_subjects` é privada ao perfil. Casos
// de uso: jazz, futebol, natação, reforço fora da escola — atividades que
// variam de criança pra criança e persistem anos sem amarração a
// `grade`/`year`. UNIQUE (profile_id, name) impede duplicata exata.
//
// Status `paused` é estado de produto (user pausa quando filho dá break);
// `paused_at` é puramente telemetria pra UI mostrar "Pausada desde X". Check
// constraint força consistência (paused ⇔ paused_at IS NOT NULL).
export const agendaProfileSubjects = agenda.table(
  "profile_subjects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => agendaStudentProfiles.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // Cor visual atribuída no INSERT, 1..5 (chart-1..chart-5). Picker tenta
    // evitar colisão dentro do mesmo perfil considerando matérias da turma
    // ativa + extras `active` do perfil — não dentro da turma (turma já tem
    // sua própria collision-free choice em `agendaSubjects`).
    colorIndex: smallint("color_index").notNull().default(1),
    // Dias da semana em que a extracurricular acontece. Aceita Seg-Dom porque
    // jazz/futebol/natação rolam sábado. Check constraint trava qualquer
    // outro valor.
    classDays: text("class_days")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`)
      .$type<AgendaExtracurricularDay[]>(),
    status: text("status", {
      enum: AGENDA_PROFILE_SUBJECT_STATUSES,
    })
      .notNull()
      .default("active"),
    pausedAt: date("paused_at"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("agenda_profile_subjects_profile_name_unique_idx").on(t.profileId, t.name),
    index("agenda_profile_subjects_profile_status_idx").on(t.profileId, t.status),
    check(
      "agenda_profile_subjects_class_days_valid",
      sql`${t.classDays} <@ ARRAY['mon','tue','wed','thu','fri','sat','sun']::text[]`,
    ),
    check(
      "agenda_profile_subjects_paused_consistency",
      sql`(${t.status} = 'paused' AND ${t.pausedAt} IS NOT NULL)
          OR (${t.status} = 'active' AND ${t.pausedAt} IS NULL)`,
    ),
  ],
);

// Atividades de matéria extracurricular. Sempre individuais (sem visibility,
// sem acceptance, sem fan-out por perfil) — extracurricular é dona dum perfil
// único, então `status` é coluna direta na row (1 row = 1 status). Reuso do
// enum literal `type` de `agenda.activities` pra UI/labels.
//
// `profileId` é redundante com `profileSubjectId.profileId` mas evita JOIN
// no path quente do dashboard. Service garante consistência no insert.
export const agendaProfileSubjectActivities = agenda.table(
  "profile_subject_activities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => agendaStudentProfiles.id, { onDelete: "cascade" }),
    profileSubjectId: uuid("profile_subject_id")
      .notNull()
      .references(() => agendaProfileSubjects.id, { onDelete: "cascade" }),
    createdByUserId: text("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    type: text("type", {
      enum: ["task", "exam", "project", "reminder"],
    }).notNull(),
    title: text("title").notNull(),
    description: text("description"),
    dueAt: date("due_at").notNull(),
    status: text("status", {
      enum: ["pending", "done"],
    })
      .notNull()
      .default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("agenda_profile_subject_activities_profile_due_idx").on(t.profileId, t.dueAt),
    index("agenda_profile_subject_activities_subject_idx").on(t.profileSubjectId),
    index("agenda_profile_subject_activities_status_due_idx").on(t.status, t.dueAt),
  ],
);

export type AgendaState = typeof agendaStates.$inferSelect;
export type AgendaCity = typeof agendaCities.$inferSelect;
export type AgendaSchool = typeof agendaSchools.$inferSelect;
export type AgendaTurma = typeof agendaTurmas.$inferSelect;
export type NewAgendaTurma = typeof agendaTurmas.$inferInsert;
export type AgendaTurmaMember = typeof agendaTurmaMembers.$inferSelect;
export type NewAgendaTurmaMember = typeof agendaTurmaMembers.$inferInsert;
export type AgendaStudentProfile = typeof agendaStudentProfiles.$inferSelect;
export type NewAgendaStudentProfile = typeof agendaStudentProfiles.$inferInsert;
export type AgendaSubject = typeof agendaSubjects.$inferSelect;
export type NewAgendaSubject = typeof agendaSubjects.$inferInsert;
export type AgendaSubjectAlternatingSlot = typeof agendaSubjectAlternatingSlots.$inferSelect;
export type NewAgendaSubjectAlternatingSlot = typeof agendaSubjectAlternatingSlots.$inferInsert;
export type AgendaActivity = typeof agendaActivities.$inferSelect;
export type NewAgendaActivity = typeof agendaActivities.$inferInsert;
export type AgendaActivityStatus = typeof agendaActivityStatuses.$inferSelect;
export type NewAgendaActivityStatus = typeof agendaActivityStatuses.$inferInsert;
export type AgendaActivityAcceptance = typeof agendaActivityAcceptances.$inferSelect;
export type NewAgendaActivityAcceptance = typeof agendaActivityAcceptances.$inferInsert;
export type AgendaProfileSubject = typeof agendaProfileSubjects.$inferSelect;
export type NewAgendaProfileSubject = typeof agendaProfileSubjects.$inferInsert;
export type AgendaProfileSubjectActivity = typeof agendaProfileSubjectActivities.$inferSelect;
export type NewAgendaProfileSubjectActivity = typeof agendaProfileSubjectActivities.$inferInsert;
