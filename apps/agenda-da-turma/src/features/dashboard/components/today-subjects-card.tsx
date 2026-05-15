import { Badge } from "@informach/ui/components/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@informach/ui/components/card";
import { Calendar, GraduationCap } from "lucide-react";
import {
  getSubjectIcon,
  getSubjectIconClassByIndex,
  getSubjectTintedClassByIndex,
} from "@/features/subjects/utils";
import type { TodaySubjectsView } from "../today-subjects-service";

type Props = {
  view: TodaySubjectsView;
};

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
// Server-TZ-neutro: parseia componentes diretamente da string, sem criar
// Date com timezone offset (mesmo princípio do `parseLocalIso`).
function formatDayLabel(iso: string): string {
  const [yearStr, monthStr, dayStr] = iso.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  if (!year || !month || !day) return iso;
  // Constrói Date local meio-dia só pra extrair getDay() — não usado pra
  // exibir, então não importa que seja local-TZ.
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  const weekday = WEEKDAY_LONG[date.getDay()] ?? "";
  const monthName = MONTH_LONG[month - 1] ?? "";
  return `${weekday}, ${day} de ${monthName}`;
}

export function TodaySubjectsCard({ view }: Props) {
  const dayLabel = formatDayLabel(view.todayIso);
  const isWeekend = view.todayDay === null;

  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <GraduationCap className="size-5 text-primary" aria-hidden />
          Matérias de hoje
          <span className="text-sm font-normal text-muted-foreground">· {view.profileName}</span>
        </CardTitle>
        <CardDescription className="flex items-center gap-1.5">
          <Calendar className="size-3.5" aria-hidden />
          {dayLabel}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {view.subjects.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {isWeekend
              ? "Nenhuma aula hoje. Aproveite o fim de semana."
              : "Nenhuma aula cadastrada para hoje."}
          </p>
        ) : (
          <ul className="space-y-2">
            {view.subjects.map((s) => {
              const Icon = getSubjectIcon(s.name);
              return (
                <li
                  key={s.id}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 ${getSubjectTintedClassByIndex(s.colorIndex)}`}
                >
                  <span
                    className={`flex size-8 shrink-0 items-center justify-center rounded-full ${getSubjectIconClassByIndex(s.colorIndex)}`}
                  >
                    <Icon className="size-4" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{s.name}</p>
                    {s.source === "turma" && s.teacherName ? (
                      <p className="truncate text-xs text-muted-foreground">
                        Prof. {s.teacherName}
                      </p>
                    ) : null}
                  </div>
                  {s.source === "extra" ? (
                    <Badge variant="outline" className="shrink-0 text-xs">
                      Extra
                    </Badge>
                  ) : s.isAlternating ? (
                    <Badge variant="secondary" className="shrink-0 text-xs">
                      {s.alternatingPairName ? `Reveza com ${s.alternatingPairName}` : "quinzenal"}
                    </Badge>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
