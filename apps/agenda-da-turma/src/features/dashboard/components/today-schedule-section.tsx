import { Skeleton } from "@informach/ui/components/skeleton";
import { Hand } from "lucide-react";
import Link from "next/link";
import { StudentAvatar } from "@/features/students/components/student-avatar";
import { SubjectKitDialog } from "@/features/subject-kits/components/subject-kit-dialog";
import { listSubjectKits } from "@/features/subject-kits/service";
import { getTodaySubjectsForProfiles, type TodaySubjectsView } from "../today-subjects-service";

function ProfileSchedule({
  view,
  kits,
  showTurmaLink,
}: {
  view: TodaySubjectsView;
  kits: Record<string, string[]>;
  /** Com crianças em turmas diferentes, cada linha leva ao horário da sua. */
  showTurmaLink: boolean;
}) {
  const isWeekend = view.classDay === null;
  return (
    <li className="space-y-2.5 border-t border-foreground/15 px-4 py-3 first:border-t-0 sm:px-5">
      <div className="flex items-center gap-3">
        <StudentAvatar name={view.profileName} size="row" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-bold">{view.profileName}</p>
          {view.subjects.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">
              {isWeekend
                ? "Sem aula hoje. Bom descanso!"
                : view.turmaId
                  ? "Nenhuma aula no horário de hoje."
                  : "Sem turma ainda."}
            </p>
          ) : null}
        </div>
        {/*
          A porta da vez da criança onde o telefone costuma ser passado: a linha
          da própria criança, na primeira tela da manhã.
        */}
        <Link
          href={`/crianca/${view.profileId}`}
          className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border border-foreground/15 bg-background px-3 text-sm font-bold hover:bg-muted"
        >
          <Hand className="size-4" aria-hidden />A vez de {view.profileName}
        </Link>
      </div>
      {view.subjects.length > 0 ? (
        <ul
          className="flex flex-wrap gap-1.5 pl-12"
          aria-label={`Aulas de ${view.profileName} hoje`}
        >
          {view.subjects.map((subject) => (
            <li key={subject.id}>
              <SubjectKitDialog
                variant="chip"
                colorIndex={subject.colorIndex}
                note={
                  subject.source === "extra"
                    ? "fora da escola"
                    : subject.isAlternating
                      ? subject.alternatingPairName
                        ? `reveza com ${subject.alternatingPairName}`
                        : "quinzenal"
                      : null
                }
                profileId={view.profileId}
                subjectId={subject.source === "turma" ? subject.id : null}
                profileSubjectId={subject.source === "extra" ? subject.id : null}
                subjectName={subject.name}
                profileName={view.profileName}
                items={kits[`${view.profileId}:${subject.id}`] ?? []}
              />
            </li>
          ))}
        </ul>
      ) : null}
      {showTurmaLink && view.turmaId ? (
        <Link
          href={`/turmas/${view.turmaId}/materias`}
          className="ml-12 inline-flex min-h-11 items-center text-[13px] font-bold text-primary-ink"
        >
          Horário da turma
        </Link>
      ) : null}
    </li>
  );
}

export type TodaySchedule = { views: TodaySubjectsView[]; kits: Record<string, string[]> };

/**
 * As aulas de hoje e o "levar sempre" de cada uma.
 *
 * A página chama isto ANTES de esperar a rotina e passa a promessa adiante:
 * "Hoje na escola" mora dentro da rotina (entre "Para hoje" e "Amanhã"), e se
 * a consulta só começasse quando a rotina terminasse, as aulas chegariam
 * sempre depois das atividades.
 */
export async function loadTodaySchedule(
  userId: string,
  profileFilter: string | null,
): Promise<TodaySchedule> {
  const views = await getTodaySubjectsForProfiles(userId, { profileFilter });
  if (views.length === 0) return { views, kits: {} };
  const kits = Object.fromEntries(
    await listSubjectKits(
      userId,
      views.map((view) => view.profileId),
    ),
  );
  return { views, kits };
}

/**
 * "Hoje na escola": uma linha por criança, as aulas como pílulas com o ponto
 * da cor da matéria. Cada pílula abre o "levar sempre" daquela aula, que
 * continua sendo editado aqui. Antes eram cartões por criança com uma faixa
 * colorida por matéria, e duas crianças com cinco aulas ocupavam uma tela.
 */
export async function TodayScheduleSection({ data }: { data: Promise<TodaySchedule> }) {
  const { views, kits } = await data;
  if (views.length === 0) return null;
  const turmaIds = [...new Set(views.map((view) => view.turmaId).filter(Boolean))];
  const singleTurma = turmaIds.length === 1 ? turmaIds[0] : null;

  return (
    <section
      aria-labelledby="today-schedule-title"
      className="overflow-hidden rounded-[20px] border border-foreground/15 bg-background"
    >
      <div className="flex items-baseline justify-between gap-3 px-4 pb-1 pt-4 sm:px-5">
        <h2 id="today-schedule-title" className="text-xl font-extrabold tracking-tight">
          Hoje na escola
        </h2>
        {singleTurma ? (
          <Link
            href={`/turmas/${singleTurma}/materias`}
            className="inline-flex min-h-11 items-center text-sm font-bold text-primary-ink"
          >
            Horário
          </Link>
        ) : null}
      </div>
      <ul>
        {views.map((view) => (
          <ProfileSchedule
            key={view.profileId}
            view={view}
            kits={kits}
            showTurmaLink={turmaIds.length > 1}
          />
        ))}
      </ul>
    </section>
  );
}

export function TodayScheduleSkeleton() {
  return (
    <div role="status" aria-label="Carregando as aulas de hoje">
      <Skeleton className="h-36 rounded-[20px]" aria-hidden />
    </div>
  );
}
