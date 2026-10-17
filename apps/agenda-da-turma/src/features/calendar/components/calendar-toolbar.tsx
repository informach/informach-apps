import { cn } from "@informach/ui/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { endOfWeekIso, formatMonthLabel, formatWeekRangeLabel, startOfWeekIso } from "../date";
import type { CalendarView } from "../types";

type Props = {
  view: CalendarView;
  anchorIso: string;
  todayIso: string;
  /** Os endereços de cada controle, com a criança e a data da tela. */
  hrefs: {
    week: string;
    month: string;
    prev: string;
    next: string;
    today: string;
  };
};

const navButton =
  "flex size-11 shrink-0 items-center justify-center rounded-xl border border-foreground/15 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Semana ou mês, e o período na tela entre as duas setas.
 *
 * Tudo aqui é link, e não botão com `router.replace`: navega antes de a página
 * hidratar (um toque cedo não se perde) e o endereço já leva a criança e a
 * data. Saíram daqui o filtro de criança (a criança escolhida em Hoje viaja
 * pela navegação, `?perfil=`; o canvas não tem pílulas aqui), "Nova atividade"
 * e "Adicionar de um recado": um botão por destino, e o + do rodapé é a porta
 * de entrada. Na semana, cada dia vazio tem o seu "+".
 */
export function CalendarToolbar({ view, anchorIso, todayIso, hrefs }: Props) {
  const isWeek = view === "week";
  const from = isWeek ? startOfWeekIso(anchorIso) : `${anchorIso.slice(0, 7)}-01`;
  const label = isWeek
    ? formatWeekRangeLabel(from, endOfWeekIso(anchorIso), todayIso)
    : formatMonthLabel(anchorIso);
  const showsToday = isWeek
    ? from <= todayIso && todayIso <= endOfWeekIso(anchorIso)
    : anchorIso.slice(0, 7) === todayIso.slice(0, 7);

  return (
    <div className="space-y-3.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[34px] font-extrabold leading-tight tracking-[-0.04em]">Semana</h1>
        <nav aria-label="Como ver" className="flex w-fit gap-1 rounded-xl bg-card p-1">
          {(
            [
              { value: "week", label: "Semana", href: hrefs.week },
              { value: "month", label: "Mês", href: hrefs.month },
            ] as const
          ).map((option) => (
            <Link
              key={option.value}
              href={option.href}
              replace
              scroll={false}
              aria-current={view === option.value ? "page" : undefined}
              className={cn(
                "inline-flex min-h-9 relative after:absolute after:inset-x-0 after:-inset-y-1 after:content-[''] items-center rounded-[9px] px-3.5 text-sm font-bold",
                view === option.value
                  ? "bg-background text-foreground"
                  : "text-foreground/75 hover:text-foreground",
              )}
            >
              {option.label}
            </Link>
          ))}
        </nav>
      </div>
      <div className="flex items-center gap-2">
        <Link
          href={hrefs.prev}
          replace
          scroll={false}
          aria-label={isWeek ? "Semana anterior" : "Mês anterior"}
          className={navButton}
        >
          <ChevronLeft className="size-5" aria-hidden />
        </Link>
        <h2
          className="min-w-0 flex-1 truncate text-center text-[17px] font-bold"
          aria-live="polite"
        >
          {label}
        </h2>
        <Link
          href={hrefs.next}
          replace
          scroll={false}
          aria-label={isWeek ? "Próxima semana" : "Próximo mês"}
          className={navButton}
        >
          <ChevronRight className="size-5" aria-hidden />
        </Link>
      </div>
      {showsToday ? null : (
        <Link
          href={hrefs.today}
          replace
          scroll={false}
          className="mx-auto flex min-h-11 w-fit items-center px-3 text-sm font-bold text-primary-ink"
        >
          {isWeek ? "Voltar para esta semana" : "Voltar para este mês"}
        </Link>
      )}
    </div>
  );
}
