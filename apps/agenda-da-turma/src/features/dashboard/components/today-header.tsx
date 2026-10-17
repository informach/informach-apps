import type { ReactNode } from "react";
import { appHour } from "../date";
import { dayMonthLabel, weekdayLong } from "../day-labels";

function greetingFor(hour: number) {
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

function firstName(name: string | null | undefined) {
  const first = name?.trim().split(/\s+/)[0];
  return first || null;
}

/**
 * O topo de Hoje é a página da agenda: o dia da semana grande, como na agenda
 * de papel ("Segunda, 19" no celular, "Segunda, 19 de outubro" no computador,
 * com as pílulas de criança ao lado). À noite, o título vira "A mochila de
 * amanhã" e a saudação leva o dia e a hora.
 */
export function TodayHeader({
  todayIso,
  userName,
  filter,
  evening = false,
  now = new Date(),
}: {
  todayIso: string;
  userName: string | null | undefined;
  /** As pílulas de criança, ao lado da data no computador. */
  filter?: ReactNode;
  evening?: boolean;
  now?: Date;
}) {
  const name = firstName(userName);
  const hour = appHour(now);
  const greeting = name ? `${greetingFor(hour)}, ${name}` : greetingFor(hour);
  const weekday = weekdayLong(todayIso);
  const day = Number(todayIso.slice(8));
  const month = dayMonthLabel(todayIso, todayIso).split(" de ")[1];

  if (evening)
    return (
      <header className="space-y-1.5">
        <p className="text-[15px] font-medium text-muted-foreground">
          {greeting} · {weekday.toLowerCase()}, {hour}h
        </p>
        <h1 className="text-[42px] font-extrabold leading-[1.02] tracking-[-0.05em]">
          A mochila de amanhã
        </h1>
      </header>
    );

  return (
    <header className="flex items-end justify-between gap-5">
      <div className="space-y-1.5 lg:space-y-1">
        <p className="text-[15px] font-medium text-muted-foreground">{greeting}</p>
        <h1 className="text-[46px] font-extrabold leading-none tracking-[-0.05em] lg:text-[52px]">
          {weekday}, {day}
          <span className="sr-only lg:not-sr-only"> de {month}</span>
        </h1>
      </div>
      {filter ? <div className="hidden shrink-0 lg:block">{filter}</div> : null}
    </header>
  );
}
