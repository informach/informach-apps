import { Skeleton } from "@informach/ui/components/skeleton";
import { Hand } from "lucide-react";
import Link from "next/link";
import { StudentAvatar } from "@/features/students/components/student-avatar";
import { SubjectKitDialog } from "@/features/subject-kits/components/subject-kit-dialog";
import { listSubjectKits } from "@/features/subject-kits/service";
import { SHEET_LINK } from "@/features/unified-activities/components/activity-list";
import { getTodaySubjectsForProfiles, type TodaySubjectsView } from "../today-subjects-service";

/** As aulas de hoje em texto corrido; cada nome abre o "levar sempre" daquela aula. */
function SubjectNames({ view, kits }: { view: TodaySubjectsView; kits: Record<string, string[]> }) {
  if (view.subjects.length === 0)
    return (
      <>
        {view.classDay === null
          ? "Sem aula hoje. Bom descanso!"
          : view.turmaId
            ? "Nenhuma aula no horário de hoje."
            : "Sem turma ainda."}
      </>
    );
  return (
    <>
      {view.subjects.map((subject, index) => (
        <span key={subject.id}>
          {index > 0 ? ", " : null}
          <SubjectKitDialog
            variant="text"
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
        </span>
      ))}
    </>
  );
}

/**
 * Uma criança por linha. No celular: o avatar, o nome, as aulas e "A vez de
 * Clara" como botão. No computador, a tabela do canvas: nome, aulas e o link.
 */
function ProfileSchedule({
  view,
  kits,
}: {
  view: TodaySubjectsView;
  kits: Record<string, string[]>;
}) {
  return (
    <li className="border-t border-foreground/15">
      <div className="flex min-h-16 items-center gap-3 py-2.5 pl-3.5 pr-3.5 lg:hidden">
        <StudentAvatar name={view.profileName} size="line" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-bold">{view.profileName}</p>
          <p className="text-[13px] font-medium text-muted-foreground">
            <SubjectNames view={view} kits={kits} />
          </p>
        </div>
        {/*
          A porta da vez da criança onde o telefone costuma ser passado: a linha
          da própria criança, na primeira tela da manhã.
        */}
        <Link
          href={`/crianca/${view.profileId}`}
          className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border border-foreground/15 bg-background px-3.5 text-sm font-bold hover:bg-muted"
        >
          <Hand className="size-[18px]" aria-hidden />A vez de {view.profileName}
        </Link>
      </div>
      <div className="hidden grid-cols-[70px_1fr_auto] items-center gap-2.5 px-5 py-3 text-sm leading-[normal] lg:grid">
        <b className="truncate">{view.profileName}</b>
        <span className="min-w-0">
          <SubjectNames view={view} kits={kits} />
        </span>
        <Link href={`/crianca/${view.profileId}`} className={SHEET_LINK}>
          A vez de {view.profileName}
        </Link>
      </div>
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
  // "Horário" leva à turma da primeira criança que tem uma; quem tem crianças
  // em turmas diferentes chega às outras por Família.
  const firstTurma = views.find((view) => view.turmaId)?.turmaId ?? null;

  return (
    <section
      aria-labelledby="today-schedule-title"
      className="overflow-hidden rounded-[20px] border border-foreground/15 bg-background"
    >
      <div className="flex items-baseline justify-between gap-3 px-[18px] pb-2.5 pt-4 lg:px-5">
        <h2
          id="today-schedule-title"
          className="text-[21px] font-extrabold leading-[normal] tracking-[-0.02em] lg:text-xl"
        >
          Hoje na escola
        </h2>
        {firstTurma ? (
          <Link href={`/turmas/${firstTurma}/materias`} className={`${SHEET_LINK} lg:hidden`}>
            Horário
          </Link>
        ) : null}
      </div>
      <ul>
        {views.map((view) => (
          <ProfileSchedule key={view.profileId} view={view} kits={kits} />
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
