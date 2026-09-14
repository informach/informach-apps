import { Badge } from "@informach/ui/components/badge";
import { Skeleton } from "@informach/ui/components/skeleton";
import { cn } from "@informach/ui/lib/utils";
import { CalendarClock, GraduationCap } from "lucide-react";
import Link from "next/link";
import {
  getSubjectIcon,
  getSubjectIconClassByIndex,
  getSubjectTintedClassByIndex,
} from "@/features/subjects/utils";
import { getTodaySubjectsForProfiles, type TodaySubjectsView } from "../today-subjects-service";

const WEEKDAY_LONG = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
] as const;

const MONTH_LONG = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
] as const;

// Formato "Quinta-feira, 14 de maio" a partir de "YYYY-MM-DD" como wall-clock.
// Server-TZ-neutro: parseia componentes direto da string, sem criar Date com
// offset de timezone (mesmo princípio do `parseLocalIso`).
function formatDayLabel(iso: string): string {
  const [yearStr, monthStr, dayStr] = iso.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  if (!year || !month || !day) return iso;
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  const weekday = WEEKDAY_LONG[date.getDay()] ?? "";
  const monthName = MONTH_LONG[month - 1] ?? "";
  return `${weekday}, ${day} de ${monthName}`;
}

function ProfileSchedule({ view }: { view: TodaySubjectsView }) {
  const isWeekend = view.todayDay === null;
  return (
    <article className="rounded-2xl border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="min-w-0 break-words text-base font-semibold">{view.profileName}</h3>
        {view.turmaId ? (
          <Link
            href={`/turmas/${view.turmaId}/materias`}
            className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Ajustar horário
          </Link>
        ) : null}
      </div>
      {view.subjects.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          {isWeekend
            ? "Sem aulas hoje. Bom descanso!"
            : "Nenhuma aula cadastrada para hoje nesse horário."}
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {view.subjects.map((subject) => {
            const Icon = getSubjectIcon(subject.name);
            return (
              <li
                key={subject.id}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2",
                  getSubjectTintedClassByIndex(subject.colorIndex),
                )}
              >
                <span
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-full",
                    getSubjectIconClassByIndex(subject.colorIndex),
                  )}
                >
                  <Icon className="size-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{subject.name}</p>
                  {subject.source === "turma" && subject.teacherName ? (
                    <p className="truncate text-xs text-muted-foreground">
                      Prof. {subject.teacherName}
                    </p>
                  ) : null}
                </div>
                {subject.source === "extra" ? (
                  <Badge variant="outline" className="shrink-0 text-xs">
                    Extra
                  </Badge>
                ) : subject.isAlternating ? (
                  <Badge variant="secondary" className="shrink-0 text-xs">
                    {subject.alternatingPairName
                      ? `Reveza com ${subject.alternatingPairName}`
                      : "Quinzenal"}
                  </Badge>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </article>
  );
}

/**
 * "Hoje na escola" — o horário do dia de CADA criança, no topo do dashboard.
 *
 * Antes o horário existia só para um perfil por vez e ficava dentro de um
 * bloco recolhido no rodapé da página; com mais de um filho era preciso
 * filtrar um de cada vez para saber o dia de cada um.
 */
export async function TodayScheduleSection({
  userId,
  profileFilter,
}: {
  userId: string;
  profileFilter: string | null;
}) {
  const views = await getTodaySubjectsForProfiles(userId, { profileFilter });
  if (views.length === 0) return null;

  const dayLabel = formatDayLabel(views[0]?.todayIso ?? "");

  return (
    <section className="space-y-4" aria-labelledby="today-schedule-title">
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <GraduationCap className="size-6" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="today-schedule-title" className="text-xl font-semibold tracking-tight">
            Hoje na escola
          </h2>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
            <CalendarClock className="size-3.5 shrink-0" aria-hidden />
            {dayLabel}
          </p>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {views.map((view) => (
          <ProfileSchedule key={view.profileId} view={view} />
        ))}
      </div>
    </section>
  );
}

export function TodayScheduleSkeleton() {
  return (
    <div role="status" aria-label="Carregando o horário de hoje" className="space-y-4">
      <div className="flex items-center gap-3" aria-hidden>
        <Skeleton className="size-11 shrink-0 rounded-2xl" />
        <div className="space-y-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-3 w-48" />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2" aria-hidden>
        <Skeleton className="h-40 rounded-2xl" />
        <Skeleton className="h-40 rounded-2xl" />
      </div>
    </div>
  );
}
