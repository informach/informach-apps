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
 * de papel. Antes era "Rotina da família" com um ícone de sol e um botão de
 * PDF, e o dia de hoje só aparecia três blocos abaixo, dentro de "Hoje na
 * escola".
 */
export function TodayHeader({
  todayIso,
  userName,
  now = new Date(),
}: {
  todayIso: string;
  userName: string | null | undefined;
  now?: Date;
}) {
  const name = firstName(userName);
  const greeting = greetingFor(appHour(now));
  return (
    <header className="space-y-1">
      <p className="text-[15px] font-medium text-muted-foreground">
        {name ? `${greeting}, ${name}` : greeting}
      </p>
      <h1 className="text-[44px] font-extrabold leading-none tracking-[-0.045em] md:text-5xl">
        {weekdayLong(todayIso)}, {Number(todayIso.slice(8))}
        <span className="sr-only"> de {dayMonthLabel(todayIso, todayIso).split(" de ")[1]}</span>
      </h1>
    </header>
  );
}
