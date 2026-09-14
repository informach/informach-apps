import "server-only";

import { listAccessibleProfiles } from "@/features/family/access";
import { isExtraSubjectActiveOnDate } from "@/features/profile-subjects/class-days";
import {
  listActiveProfileSubjectsForProfile,
  listActiveProfileSubjectsForProfiles,
} from "@/features/profile-subjects/repository";
import type { ProfileSubject } from "@/features/profile-subjects/types";
import { findStudentProfileByIdForUser } from "@/features/students/repository";
import {
  type AgendaClassDay,
  dayOfWeekToClassDay,
  isSubjectActiveOnDate,
} from "@/features/subjects/class-days";
import { attachAlternatingSlots, listSubjectsForTurma } from "@/features/subjects/repository";
import type { Subject } from "@/features/subjects/types";
import { listMembershipsForProfiles, verifyMembership } from "@/features/turmas/repository";
import { todayLocalIso } from "./date";

// Discriminated union — UI renderer escolhe o conjunto de campos a usar
// segundo `source`. Matérias de turma trazem revezamento quinzenal (slots);
// extras nunca (na v1).
export type TodaySubject =
  | {
      source: "turma";
      id: string;
      name: string;
      teacherName: string | null;
      colorIndex: number;
      isAlternating: boolean;
      alternatingPairName: string | null;
    }
  | {
      source: "extra";
      id: string;
      name: string;
      colorIndex: number;
      // Telemetria pra UI mostrar "Pausada desde X" caso resolva exibir
      // matérias paused futuramente. v1 só active aparece aqui.
      status: "active" | "paused";
    };

export type TodaySubjectsView = {
  profileId: string;
  profileName: string;
  // Turma ativa confirmada por participação — a UI usa pra levar o usuário
  // direto à edição do horário. Null quando o perfil não tem turma válida.
  turmaId: string | null;
  todayIso: string;
  // Weekday do `todayIso` no enum AgendaClassDay (Seg-Sex). Null em Sáb/Dom.
  todayDay: AgendaClassDay | null;
  // Lista combinada — matérias da turma (com horário cadastrado e que
  // batem hoje) + extras `active` do perfil que rolam hoje.
  subjects: TodaySubject[];
};

const sortByName = (a: TodaySubject, b: TodaySubject) => a.name.localeCompare(b.name, "pt-BR");

/**
 * Monta a vista de um perfil a partir de dados já carregados. É a única
 * implementação da regra "essa matéria rola hoje?" — tanto a versão de um
 * perfil quanto a em lote passam por aqui, então o revezamento quinzenal não
 * fica duplicado.
 *
 * Devolve `null` quando não há nada que justifique o widget: nenhuma matéria
 * de turma com horário cadastrado E nenhuma extra ativa.
 */
function buildTodaySubjectsView(input: {
  profileId: string;
  profileName: string;
  turmaId: string | null;
  todayIso: string;
  todayDay: AgendaClassDay | null;
  turmaSubjects: Subject[];
  extraSubjects: ProfileSubject[];
}): TodaySubjectsView | null {
  const { todayIso, todayDay, turmaSubjects, extraSubjects } = input;

  const hasAnyTurmaClassDays = turmaSubjects.some((s) => s.classDays.length > 0);
  if (!hasAnyTurmaClassDays && extraSubjects.length === 0) return null;

  const subjectNameById = new Map(turmaSubjects.map((s) => [s.id, s.name]));

  const todayTurma: TodaySubject[] = turmaSubjects
    .filter((s) =>
      isSubjectActiveOnDate(
        todayIso,
        s.classDays,
        s.alternatingSlots.map((slot) => ({ day: slot.dayOfWeek, anchorIso: slot.anchorDate })),
      ),
    )
    .map((s): TodaySubject => {
      const todaySlot = todayDay
        ? s.alternatingSlots.find((slot) => slot.dayOfWeek === todayDay)
        : undefined;
      const pairName = todaySlot ? (subjectNameById.get(todaySlot.pairedSubjectId) ?? null) : null;
      return {
        source: "turma" as const,
        id: s.id,
        name: s.name,
        teacherName: s.teacherName,
        colorIndex: s.colorIndex,
        isAlternating: todaySlot !== undefined,
        alternatingPairName: pairName,
      };
    });

  const todayExtras: TodaySubject[] = extraSubjects
    .filter((s) => isExtraSubjectActiveOnDate(todayIso, s.classDays))
    .map(
      (s): TodaySubject => ({
        source: "extra" as const,
        id: s.id,
        name: s.name,
        colorIndex: s.colorIndex,
        status: s.status,
      }),
    );

  // Ordem fixa: turma primeiro (alfabético), extras depois (alfabético).
  // Decisão de produto: matérias da turma têm prioridade visual — são o core
  // do app; extracurriculares são satélite.
  return {
    profileId: input.profileId,
    profileName: input.profileName,
    turmaId: input.turmaId,
    todayIso,
    todayDay,
    subjects: [...todayTurma.sort(sortByName), ...todayExtras.sort(sortByName)],
  };
}

function resolveToday(): { todayIso: string; todayDay: AgendaClassDay | null } {
  const todayIso = todayLocalIso();
  const todayJsDay = new Date(`${todayIso}T12:00:00`).getDay();
  return { todayIso, todayDay: dayOfWeekToClassDay(todayJsDay) };
}

/**
 * Matérias de HOJE de um perfil. Mistura turma + extracurriculares.
 *
 * Retorna `null` quando o perfil não existe/não é do user, ou quando não há
 * nem turma com horário nem extra ativa.
 */
export async function getTodaySubjectsForProfile(
  userId: string,
  profileId: string,
): Promise<TodaySubjectsView | null> {
  const profile = await findStudentProfileByIdForUser(userId, profileId);
  if (!profile) return null;

  const { todayIso, todayDay } = resolveToday();
  const activeTurmaId =
    profile.activeTurmaId && (await verifyMembership(profile.id, profile.activeTurmaId))
      ? profile.activeTurmaId
      : null;

  const [turmaRows, extraSubjects] = await Promise.all([
    activeTurmaId ? listSubjectsForTurma(activeTurmaId) : Promise.resolve([]),
    listActiveProfileSubjectsForProfile(profileId),
  ]);

  return buildTodaySubjectsView({
    profileId: profile.id,
    profileName: profile.name,
    turmaId: activeTurmaId,
    todayIso,
    todayDay,
    turmaSubjects: turmaRows.length > 0 ? await attachAlternatingSlots(turmaRows) : [],
    extraSubjects,
  });
}

/**
 * Matérias de HOJE de TODOS os perfis acessíveis (ou de um só, quando há
 * filtro). O dashboard abre mostrando o dia de cada criança, então chamar a
 * versão de um perfil em laço seria N+1: aqui as participações, as matérias
 * por turma distinta e as extras saem em três consultas, independentemente do
 * número de filhos.
 *
 * Perfis sem nada a mostrar são omitidos do resultado (mesma regra da versão
 * individual). A ordem segue o nome da criança.
 */
export async function getTodaySubjectsForProfiles(
  userId: string,
  options: { profileFilter?: string | null } = {},
): Promise<TodaySubjectsView[]> {
  const accessible = await listAccessibleProfiles(userId);
  const profiles = (
    options.profileFilter ? accessible.filter((p) => p.id === options.profileFilter) : accessible
  ).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  if (profiles.length === 0) return [];

  const { todayIso, todayDay } = resolveToday();
  const profileIds = profiles.map((p) => p.id);

  const [memberships, extras] = await Promise.all([
    listMembershipsForProfiles(profileIds),
    listActiveProfileSubjectsForProfiles(profileIds),
  ]);

  // `active_turma_id` é preferência; só vale com participação confirmada.
  const membershipKeys = new Set(memberships.map((m) => `${m.profileId}:${m.turmaId}`));
  const turmaIdByProfile = new Map<string, string>();
  for (const profile of profiles) {
    if (profile.activeTurmaId && membershipKeys.has(`${profile.id}:${profile.activeTurmaId}`)) {
      turmaIdByProfile.set(profile.id, profile.activeTurmaId);
    }
  }

  // Uma consulta por turma DISTINTA — irmãos na mesma turma compartilham.
  const distinctTurmaIds = [...new Set(turmaIdByProfile.values())];
  const subjectsByTurma = new Map<string, Subject[]>();
  if (distinctTurmaIds.length > 0) {
    const perTurma = await Promise.all(distinctTurmaIds.map((id) => listSubjectsForTurma(id)));
    // `attachAlternatingSlots` uma única vez sobre a união: os slots saem numa
    // consulta só, em vez de uma por turma.
    const withSlots = await attachAlternatingSlots(perTurma.flat());
    for (const [index, turmaId] of distinctTurmaIds.entries()) {
      const ids = new Set(perTurma[index]?.map((s) => s.id));
      subjectsByTurma.set(
        turmaId,
        withSlots.filter((s) => ids.has(s.id)),
      );
    }
  }

  const extrasByProfile = new Map<string, ProfileSubject[]>();
  for (const extra of extras) {
    const list = extrasByProfile.get(extra.profileId);
    if (list) list.push(extra);
    else extrasByProfile.set(extra.profileId, [extra]);
  }

  return profiles
    .map((profile) => {
      const turmaId = turmaIdByProfile.get(profile.id) ?? null;
      return buildTodaySubjectsView({
        profileId: profile.id,
        profileName: profile.name,
        turmaId,
        todayIso,
        todayDay,
        turmaSubjects: turmaId ? (subjectsByTurma.get(turmaId) ?? []) : [],
        extraSubjects: extrasByProfile.get(profile.id) ?? [],
      });
    })
    .filter((view): view is TodaySubjectsView => view !== null);
}
