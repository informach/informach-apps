import { cn } from "@informach/ui/lib/utils";
import Link from "next/link";
import { weekdayShort } from "../day-labels";

export type WeekStripDay = {
  iso: string;
  /** Um ponto por atividade do dia, com a cor da matéria (`null` sem matéria). */
  dots: Array<{ key: string; color: number | null }>;
  full: boolean;
};

const DOT_CLASS: Record<number, string> = {
  1: "bg-chart-1",
  2: "bg-chart-2",
  3: "bg-chart-3",
  4: "bg-chart-4",
  5: "bg-chart-5",
};

/**
 * A semana numa linha: sete dias, a partir de hoje, com um ponto por atividade.
 *
 * Substitui os quatro números do topo de Hoje ("Atrasadas", "Hoje", "Próximos
 * 7 dias", "Concluídas") e a terceira lista inteira da semana. O ponto tem a
 * cor da matéria, o dia cheio ganha contorno laranja, e cada dia abre a vista
 * do dia no calendário. Os pontos param em quatro: mais que isso é "dia cheio",
 * e o contorno já diz.
 */
export function WeekStrip({
  days,
  todayIso,
  profileFilter,
}: {
  days: WeekStripDay[];
  todayIso: string;
  profileFilter: string | null;
}) {
  return (
    <ol className="grid grid-cols-7 gap-1" aria-label="Os próximos sete dias">
      {days.map((day) => {
        const isToday = day.iso === todayIso;
        const count = day.dots.length;
        const params = new URLSearchParams({ view: "day", date: day.iso });
        if (profileFilter) params.set("perfil", profileFilter);
        return (
          <li key={day.iso}>
            <Link
              href={`/calendario?${params}`}
              aria-label={`${weekdayShort(day.iso)}, ${Number(day.iso.slice(8))}: ${
                count === 0 ? "nada marcado" : count === 1 ? "1 atividade" : `${count} atividades`
              }${day.full ? ", dia cheio" : ""}`}
              className={cn(
                "flex min-h-[68px] flex-col items-center justify-center gap-1 rounded-xl transition-colors",
                isToday
                  ? "bg-foreground text-background"
                  : day.full
                    ? "border-2 border-chart-4 hover:bg-chart-4/10"
                    : "hover:bg-muted",
              )}
            >
              <span
                className={cn(
                  "text-[11px] font-bold",
                  isToday ? "" : day.full ? "text-chart-4-ink" : "text-muted-foreground",
                )}
              >
                {weekdayShort(day.iso)}
              </span>
              <span className="text-lg font-extrabold leading-none tabular-nums">
                {Number(day.iso.slice(8))}
              </span>
              <span className="flex h-1.5 items-center gap-0.5" aria-hidden>
                {day.dots.slice(0, 4).map((dot) => (
                  <span
                    key={dot.key}
                    className={cn(
                      "size-1.5 rounded-full",
                      isToday
                        ? "bg-background"
                        : dot.color
                          ? DOT_CLASS[dot.color]
                          : "bg-foreground/70",
                    )}
                  />
                ))}
              </span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
