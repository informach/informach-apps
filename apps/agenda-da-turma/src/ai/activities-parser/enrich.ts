import { findClosestStudent } from "@/features/activities/match-student";
import { findClosestSubject } from "@/features/activities/match-subject";
import type { ParsedActivityInput, TurmaWithSubjectsForForm } from "@/features/activities/types";
import { todayLocalIso } from "@/features/dashboard/date";
import {
  type AlternatingSlot as ClassDaySlot,
  nextClassDayIso,
  nextWeekdayIso,
} from "@/features/subjects/class-days";
import { normalize } from "@/features/subjects/utils";
import type { ActivitiesParserOutput } from "./schema";

// Slots de revezamento quinzenal, achatados pra um Map (subjectId → slots).
// Carregado pelos services de IA de atividades antes de chamar enrich;
// vazio/omitido se a feature ainda não foi configurada na turma. Usado pelo
// `applyNextClassDayFallback` pra decidir paridade no cálculo de próximo dia.
export type SlotsBySubjectId = ReadonlyMap<string, readonly ClassDaySlot[]>;

/**
 * Helpers puros do fluxo de IA de atividades — extraídos do service
 * (`parse-activities-{voice,image}-service.ts`) pra ficarem livres do
 * `"server-only"` import e poderem ser testados via Vitest sem mockar Mastra.
 *
 *   - `buildUserMessage` monta o cabeçalho fixo "Hoje é ... + Estudantes
 *     disponíveis ... [+ Matérias disponíveis...]" que as instruções do
 *     agente esperam.
 *   - `enrichWithResolvedTurma` resolve `studentNameHint` → `activeTurmaId`
 *     via `findClosestStudent` E (opcional) faz inferência cross-turma via
 *     `subjectHint` quando o estudante não foi mencionado.
 *   - `inferGuessedTurma` agrega as turmas resolvidas das atividades do
 *     batch e devolve a turma "vencedora" pro passo intermediário de
 *     confirmação no client. Conservador: só devolve turma quando há
 *     consenso entre as resolvidas (ou quando o user tem 1 turma só).
 */

export function buildUserMessage(opts: {
  transcript: string;
  studentNames: string[];
  /**
   * Turmas ativas do usuário com suas matérias. Quando presente e não vazio,
   * injeta um bloco "Matérias disponíveis nas turmas dos estudantes" no
   * cabeçalho — a IA usa pra escolher `subjectHint` apenas entre matérias
   * cadastradas E pra inferir qual turma é o foco do batch via combinação
   * de matérias detectadas.
   */
  turmasWithSubjects?: TurmaWithSubjectsForForm[];
  /**
   * Perfis (`name`, `activeTurmaId`) usados para mapear turma → nome do
   * estudante no bloco de matérias. Quando nenhum perfil casa a turma, cai
   * no formato "[Escola] · [série/letra · ano]".
   */
  profiles?: readonly ProfileLite[];
  now?: Date;
}): string {
  const today = todayLocalIso(opts.now);
  const dayOfWeek = formatDayOfWeekPtBr(today);
  const studentsLine = opts.studentNames.length > 0 ? opts.studentNames.join(", ") : "(nenhum)";
  const subjectsBlock = formatSubjectsBlock(opts.turmasWithSubjects, opts.profiles ?? []);
  return (
    `Hoje é ${today} (${dayOfWeek}, fuso America/Sao_Paulo).\n` +
    `Estudantes disponíveis: ${studentsLine}\n` +
    subjectsBlock +
    `\nConteúdo:\n${opts.transcript}`
  );
}

function formatSubjectsBlock(
  turmasWithSubjects: TurmaWithSubjectsForForm[] | undefined,
  profiles: readonly ProfileLite[],
): string {
  if (!turmasWithSubjects || turmasWithSubjects.length === 0) return "";
  const lines = turmasWithSubjects.map((t) => {
    const label = labelForTurmaInPrompt(t, profiles);
    const subjects =
      t.subjects.length > 0 ? t.subjects.map((s) => s.name).join(", ") : "(nenhuma cadastrada)";
    return `- ${label}: ${subjects}`;
  });
  return `Matérias disponíveis nas turmas dos estudantes:\n${lines.join("\n")}\n`;
}

function labelForTurmaInPrompt(
  turma: TurmaWithSubjectsForForm,
  profiles: readonly ProfileLite[],
): string {
  // Formato compacto da série/letra (ex.: "5º ano A · 2025"). Replicar aqui
  // pra não criar dependência do `formatTurmaShort` em `utils.ts` (que importa
  // outras coisas do client) e manter este módulo enxuto.
  const gradeNumber = turma.grade.replace(/[^0-9]/g, "");
  const shortGrade = gradeNumber ? `${gradeNumber}º ano ${turma.classLetter}` : turma.classLetter;
  const matchedProfile = profiles.find((p) => p.activeTurmaId === turma.turmaId);
  const studentPrefix = matchedProfile ? `${matchedProfile.name} (` : "";
  const studentSuffix = matchedProfile ? ")" : "";
  return `${studentPrefix}${shortGrade} · ${turma.schoolName}${studentSuffix}`;
}

const WEEKDAY_PT_BR = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
] as const;

function formatDayOfWeekPtBr(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) return "";
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  return WEEKDAY_PT_BR[date.getDay()] ?? "";
}

export type ProfileLite = { id: string; name: string; activeTurmaId: string | null };

export type EnrichedParseResult =
  | { isValidInput: true; activities: ParsedActivityInput[]; guessedTurmaId: string | null }
  | { isValidInput: false; reason: string | null };

export function enrichWithResolvedTurma(
  output: ActivitiesParserOutput,
  profiles: readonly ProfileLite[],
  /**
   * Turmas ativas do usuário com matérias. Quando fornecido, alimenta:
   *   (a) o fuzzy-match server-side de `subjectHint` dentro da turma resolvida;
   *   (b) o fallback cross-turma quando estudante não foi mencionado mas a
   *       matéria existe em exatamente uma turma do usuário;
   *   (c) o `inferGuessedTurma` (chamado em seguida pelos services).
   */
  turmasWithSubjects?: TurmaWithSubjectsForForm[],
  /**
   * "Hoje" usado pelo fallback final de data (`applyTomorrowFallback`).
   * Padrão `new Date()`; testes injetam um Date fixo. Mesmo pattern do
   * `buildUserMessage` neste módulo.
   */
  now: Date = new Date(),
  /**
   * Slots de revezamento quinzenal por matéria. Quando presente, o fallback
   * `applyNextClassDayFallback` usa pra decidir paridade (semana minha vs.
   * semana da pareada). Quando omitido/vazio, todos os dias são tratados
   * como semanais.
   */
  slotsBySubjectId?: SlotsBySubjectId,
): EnrichedParseResult {
  if (!output.isValidInput) {
    return { isValidInput: false, reason: output.reason ?? null };
  }
  const turmas = turmasWithSubjects ?? [];
  const rawActivities: ParsedActivityInput[] = output.activities.map((activity) => {
    const { resolvedTurmaId, resolvedSubjectId: subjectFromHint } = resolveTurmaAndSubject({
      studentNameHint: activity.studentNameHint,
      subjectHint: activity.subjectHint,
      profiles,
      turmasWithSubjects: turmas,
    });
    // Fallback: às vezes a IA não preenche `subjectHint` mas o título ainda
    // menciona a matéria (ex.: title="Prova de redação", subjectHint=null,
    // turma resolvida via studentNameHint). Quando a turma está resolvida,
    // varre as matérias da turma e usa a primeira que aparece literalmente
    // no título (busca por substring normalizada).
    const resolvedSubjectId =
      subjectFromHint ?? inferSubjectIdFromTitle(activity.title, resolvedTurmaId, turmas);
    return {
      title: activity.title,
      description: activity.description,
      type: activity.type,
      dueAt: activity.dueAt,
      subjectHint: activity.subjectHint,
      studentNameHint: activity.studentNameHint,
      resolvedTurmaId,
      resolvedSubjectId,
    };
  });
  // Ordem importa:
  //   1) Propagação — data única no topo da folha vai pras nulls (cenário típico
  //      "folha com 1 data + N atividades").
  //   2) Próximo dia de aula — pra nulls remanescentes com matéria resolvida,
  //      olha `subject.classDays` e calcula a próxima data estritamente após hoje
  //      que casa com algum dia de aula. Só vale quando a matéria tem horário
  //      cadastrado (`classDays` não-vazio).
  //   3) Fallback "amanhã" — cobre qualquer null que sobrou: imagem sem data
  //      nenhuma + matéria sem horário, ou atividade isolada sem matéria.
  const propagated = propagateUniqueDueDate(rawActivities);
  const withNextClass = applyNextClassDayFallback(propagated, turmas, now, slotsBySubjectId);
  const activities = applyTomorrowFallback(withNextClass, now);
  const guessedTurmaId = inferGuessedTurma(activities, turmas);
  return { isValidInput: true, activities, guessedTurmaId };
}

/**
 * Fallback server-side da regra de propagação de data: se há atividades no
 * batch com `dueAt: null` e TODAS as outras atividades do batch têm a MESMA
 * `dueAt` definida, propaga essa data para as nulls. Cobre o cenário típico
 * de folha escolar com uma única data no topo + várias atividades listadas
 * embaixo — algumas o modelo associou à data, outras não.
 *
 * Conservador: só propaga quando há consenso (uma única data nas resolvidas).
 * Se houver 2+ datas distintas nas resolvidas, mantém os nulls intactos —
 * indica que cada bloco tem sua própria data e a null pode ser ambígua.
 */
export function propagateUniqueDueDate(
  activities: readonly ParsedActivityInput[],
): ParsedActivityInput[] {
  const datesPresent = activities.map((a) => a.dueAt).filter((d): d is string => d !== null);
  if (datesPresent.length === 0) return activities.slice();
  const uniqueDates = new Set(datesPresent);
  if (uniqueDates.size !== 1) return activities.slice();
  const onlyDate = datesPresent[0];
  if (!onlyDate) return activities.slice();
  return activities.map((a) => (a.dueAt === null ? { ...a, dueAt: onlyDate } : a));
}

/**
 * Camada intermediária de fallback baseada em horário da matéria. Pra cada
 * atividade com `dueAt: null` que TEM `resolvedSubjectId`, busca os
 * `classDays` da matéria correspondente e calcula a próxima data ESTRITAMENTE
 * APÓS hoje que casa com algum dia cadastrado. Mantém null quando:
 *   - subject não foi resolvido (resolvedSubjectId === null);
 *   - subject não foi achado no índice de turmas (caso defensivo);
 *   - subject existe mas não tem horário cadastrado (classDays vazio).
 *
 * Quem fica null aqui cai no `applyTomorrowFallback` depois (default "amanhã").
 *
 * Por que ESTRITAMENTE APÓS hoje: atividade ditada/fotografada hoje vale pra
 * próxima aula, não pra aula de hoje (se hoje for um dia de aula, próxima é
 * a próxima ocorrência semanal).
 */
export function applyNextClassDayFallback(
  activities: readonly ParsedActivityInput[],
  turmasWithSubjects: readonly TurmaWithSubjectsForForm[],
  now: Date = new Date(),
  slotsBySubjectId?: SlotsBySubjectId,
): ParsedActivityInput[] {
  const todayIso = todayLocalIso(now);
  // Index uma vez (não por atividade) — classDays comes do mesmo array de
  // turmas que `findClosestSubject` já consumiu.
  const subjectById = new Map<string, TurmaWithSubjectsForForm["subjects"][number]>();
  for (const turma of turmasWithSubjects) {
    for (const subject of turma.subjects) {
      subjectById.set(subject.id, subject);
    }
  }
  return activities.map((a) => {
    if (a.dueAt !== null) return a;
    if (!a.resolvedSubjectId) return a;
    const subject = subjectById.get(a.resolvedSubjectId);
    if (!subject || subject.classDays.length === 0) return a;
    const slots = slotsBySubjectId?.get(a.resolvedSubjectId);
    const next = nextClassDayIso(todayIso, subject.classDays, slots);
    return next ? { ...a, dueAt: next } : a;
  });
}

/**
 * Última camada de fallback de data: qualquer atividade que CONTINUE com
 * `dueAt: null` depois das camadas anteriores recebe o PRÓXIMO DIA ÚTIL
 * (seg-sex) estritamente após hoje, em America/Sao_Paulo. Sexta → próxima
 * segunda; sábado/domingo → próxima segunda. Decisão de produto: escola
 * brasileira não tem aula sáb/dom, então "amanhã puro" (today + 1) cairia
 * no fim de semana em sextas e desviava o user. User ainda pode editar
 * antes de salvar.
 *
 * Per-atividade (não batch-level): cobre tanto "imagem inteira sem data"
 * quanto "atividade isolada que escapou da propagação porque o batch tinha
 * 2+ datas distintas". Atividades que já têm `dueAt` definida (incluindo
 * as preenchidas pelo `applyNextClassDayFallback` via horário da matéria)
 * ficam intactas — essa camada só atua em nulls remanescentes.
 */
export function applyTomorrowFallback(
  activities: readonly ParsedActivityInput[],
  now: Date = new Date(),
): ParsedActivityInput[] {
  const next = nextWeekdayIso(todayLocalIso(now));
  return activities.map((a) => (a.dueAt === null ? { ...a, dueAt: next } : a));
}

function resolveTurmaAndSubject(input: {
  studentNameHint: string | null;
  subjectHint: string | null;
  profiles: readonly ProfileLite[];
  turmasWithSubjects: readonly TurmaWithSubjectsForForm[];
}): { resolvedTurmaId: string | null; resolvedSubjectId: string | null } {
  // 1) Estudante mencionado → turma ativa do perfil casado → matéria por
  //    fuzzy-match dentro daquela turma.
  const matchedStudent = findClosestStudent(input.profiles, input.studentNameHint);
  if (matchedStudent?.activeTurmaId) {
    const turma = input.turmasWithSubjects.find((t) => t.turmaId === matchedStudent.activeTurmaId);
    const subjectId = turma
      ? (findClosestSubject(turma.subjects, input.subjectHint)?.id ?? null)
      : null;
    return { resolvedTurmaId: matchedStudent.activeTurmaId, resolvedSubjectId: subjectId };
  }

  // 2) Sem estudante: tentar matéria única cross-turma. Procura `subjectHint`
  //    em cada turma; se houver match em EXATAMENTE uma turma, usa essa
  //    turma + matéria. Conservador: 2+ → ambíguo, null.
  if (input.subjectHint && input.turmasWithSubjects.length > 0) {
    const matchesByTurma: Array<{ turmaId: string; subjectId: string }> = [];
    for (const t of input.turmasWithSubjects) {
      const matched = findClosestSubject(t.subjects, input.subjectHint);
      if (matched) {
        matchesByTurma.push({ turmaId: t.turmaId, subjectId: matched.id });
      }
    }
    if (matchesByTurma.length === 1 && matchesByTurma[0]) {
      return {
        resolvedTurmaId: matchesByTurma[0].turmaId,
        resolvedSubjectId: matchesByTurma[0].subjectId,
      };
    }
  }

  return { resolvedTurmaId: null, resolvedSubjectId: null };
}

/**
 * Fallback de matéria: varre as matérias da turma resolvida e devolve a
 * primeira cujo nome aparece como substring no título da atividade (após
 * normalização — sem acento, lowercase). Cobre casos em que a IA preenche
 * `title="Prova de redação"` mas deixa `subjectHint=null` por interpretar
 * "redação" como complemento da ação. Quando turma não está resolvida ou
 * nenhuma matéria casa, devolve null.
 *
 * Conservador: prefere matérias com nomes mais longos quando há ambiguidade
 * (ex.: "Educação Física" antes de "Física"), pra evitar matches parciais
 * frágeis em palavras compostas.
 */
function inferSubjectIdFromTitle(
  title: string,
  turmaId: string | null,
  turmas: readonly TurmaWithSubjectsForForm[],
): string | null {
  if (!turmaId) return null;
  const turma = turmas.find((t) => t.turmaId === turmaId);
  if (!turma || turma.subjects.length === 0) return null;
  const normalizedTitle = normalize(title);
  if (!normalizedTitle) return null;
  // Procura matches por substring, preferindo nomes mais longos (mais
  // específicos). Pad com espaços nas bordas pra exigir match de palavra
  // completa — evita que "Arte" case com "tArtaruga" ou similar.
  const candidates = [...turma.subjects].sort((a, b) => b.name.length - a.name.length);
  const paddedTitle = ` ${normalizedTitle} `;
  for (const subject of candidates) {
    const normalizedSubject = normalize(subject.name);
    if (!normalizedSubject) continue;
    if (paddedTitle.includes(` ${normalizedSubject} `)) {
      return subject.id;
    }
  }
  return null;
}

/**
 * Decide a turma "vencedora" do batch para alimentar o passo intermediário
 * de confirmação no client.
 *
 * Regras (conservadoras propositalmente — discrepância → null para evitar
 * salvar lote inteiro em turma errada):
 *   - `turmasWithSubjects.length === 1` → essa turma (qualquer batch é dela).
 *   - Todos `resolvedTurmaId` não-nulos são iguais E há pelo menos 1 →
 *     essa turma.
 *   - Zero resolvidas OU 2+ turmaIds diferentes nas resolvidas → null.
 */
export function inferGuessedTurma(
  activities: readonly ParsedActivityInput[],
  turmasWithSubjects: readonly TurmaWithSubjectsForForm[],
): string | null {
  if (turmasWithSubjects.length === 1) {
    return turmasWithSubjects[0]?.turmaId ?? null;
  }
  const resolved = activities
    .map((a) => a.resolvedTurmaId)
    .filter((id): id is string => id !== null);
  if (resolved.length === 0) return null;
  const first = resolved[0];
  if (!first) return null;
  const allEqual = resolved.every((id) => id === first);
  return allEqual ? first : null;
}
