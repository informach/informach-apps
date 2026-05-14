import "server-only";

import { and, db, eq, inArray, sql } from "@informach/db";
import { agendaProfileSubjects, agendaStudentProfiles, agendaSubjects } from "@informach/db/schema";
import { pickAvailableColorIndex, type SubjectColorIndex } from "@/features/subjects/utils";

// Escolhe `colorIndex` (1..5) pra uma extracurricular nova de um perfil,
// evitando colisão com:
//   - matérias da turma ATIVA do perfil (se houver) — pintadas no mesmo dia
//     no dashboard/calendário, então mesma cor = bagunça visual.
//   - matérias extras `active` do mesmo perfil — idem.
// Matérias extras `paused` NÃO contam (não aparecem no calendário). O
// fallback determinístico de `pickAvailableColorIndex` (hash do nome)
// resolve quando todas as 5 cores estão tomadas.
export async function pickAvailableColorIndexForProfile(
  profileId: string,
  name: string,
  options?: { excludeProfileSubjectId?: string },
): Promise<SubjectColorIndex> {
  const usedIndexes = await listUsedColorIndexesForProfile(profileId, {
    excludeProfileSubjectId: options?.excludeProfileSubjectId,
  });
  return pickAvailableColorIndex(name, usedIndexes);
}

async function listUsedColorIndexesForProfile(
  profileId: string,
  options?: { excludeProfileSubjectId?: string },
): Promise<number[]> {
  // Turma ativa do perfil (pode ser null — perfil sem turma).
  const [profile] = await db
    .select({ activeTurmaId: agendaStudentProfiles.activeTurmaId })
    .from(agendaStudentProfiles)
    .where(eq(agendaStudentProfiles.id, profileId))
    .limit(1);

  const turmaId = profile?.activeTurmaId ?? null;

  const queries: Promise<Array<{ colorIndex: number }>>[] = [];

  if (turmaId) {
    queries.push(
      db
        .select({ colorIndex: agendaSubjects.colorIndex })
        .from(agendaSubjects)
        .where(eq(agendaSubjects.turmaId, turmaId)),
    );
  }

  queries.push(
    db
      .select({ colorIndex: agendaProfileSubjects.colorIndex })
      .from(agendaProfileSubjects)
      .where(
        and(
          eq(agendaProfileSubjects.profileId, profileId),
          eq(agendaProfileSubjects.status, "active"),
          options?.excludeProfileSubjectId
            ? sql`${agendaProfileSubjects.id} <> ${options.excludeProfileSubjectId}`
            : sql`TRUE`,
        ),
      ),
  );

  const results = await Promise.all(queries);
  const used: number[] = [];
  for (const rows of results) {
    for (const row of rows) used.push(row.colorIndex);
  }
  return used;
}

// Carrega `colorIndex` em batch (sem hit pra cada subject) — usado em listas
// e em queries de "matérias do dia" pra repassar para o renderer.
export async function loadColorIndexesForProfileSubjects(
  ids: readonly string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (ids.length === 0) return map;
  const rows = await db
    .select({ id: agendaProfileSubjects.id, colorIndex: agendaProfileSubjects.colorIndex })
    .from(agendaProfileSubjects)
    .where(inArray(agendaProfileSubjects.id, ids));
  for (const row of rows) {
    map.set(row.id, row.colorIndex);
  }
  return map;
}
