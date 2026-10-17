/**
 * A frase de cima de Hoje: o dia inteiro numa linha.
 *
 * "Três coisas para hoje e uma passou do prazo. Amanhã, duas." É o que a
 * família leria nos quatro números que ficavam no topo (Atrasadas, Hoje,
 * Próximos 7 dias, Concluídas), dito como gente fala. Pura, para ser testada
 * e reaproveitada sem React.
 */
const COUNT_WORDS = [
  "nenhuma",
  "uma",
  "duas",
  "três",
  "quatro",
  "cinco",
  "seis",
  "sete",
  "oito",
  "nove",
  "dez",
] as const;

/** "uma", "duas"… até dez por extenso, no feminino ("coisa", "atividade"). */
export function countWord(n: number): string {
  return COUNT_WORDS[n] ?? String(n);
}

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function routineSummary(input: {
  /** Tudo o que está em "Para hoje": de hoje, atrasado e sem data. */
  forToday: number;
  /** Quantas dessas já passaram do prazo. */
  late: number;
  tomorrow: number;
  doneToday: number;
}): string {
  const { forToday, late, tomorrow, doneToday } = input;
  let first: string;
  if (forToday === 0) first = doneToday > 0 ? "Tudo de hoje está feito." : "Nada para hoje.";
  else {
    const onTime = forToday - late;
    const parts: string[] = [];
    if (onTime > 0)
      parts.push(onTime === 1 ? "uma coisa para hoje" : `${countWord(onTime)} coisas para hoje`);
    if (late > 0)
      parts.push(late === 1 ? "uma passou do prazo" : `${countWord(late)} passaram do prazo`);
    first = `${capitalize(parts.join(" e "))}.`;
  }
  const second =
    tomorrow === 0
      ? "Amanhã está livre por enquanto."
      : tomorrow === 1
        ? "Amanhã, uma."
        : `Amanhã, ${countWord(tomorrow)}.`;
  return `${first} ${second}`;
}
