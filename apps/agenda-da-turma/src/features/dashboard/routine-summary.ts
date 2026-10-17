/**
 * As frases de Hoje, puras, para serem testadas e reaproveitadas sem React.
 *
 * "Três coisas para hoje e uma que passou do prazo. Amanhã tem material de
 * Ciências e natação." É o que a família leria nos quatro números que
 * ficavam no topo, dito como gente fala, e com o que amanhã pede pelo nome.
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

/** "a", "a e b", "a, b e c". */
export function joinWords(words: readonly string[]): string {
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} e ${words[words.length - 1]}`;
}

/** Os nomes das atividades, no singular, para frases como "prova de Português". */
const TYPE_NOUNS: Record<string, string> = {
  task: "tarefa",
  exam: "prova",
  project: "trabalho",
  reminder: "lembrete",
  material: "material",
  authorization: "autorização",
  event: "evento",
  study: "estudo",
};

/** "material de Ciências", "prova de Inglês", ou o título quando não há matéria. */
export function describeThing(item: {
  type: string;
  title: string;
  subjectName: string | null;
}): string {
  if (item.subjectName) return `${TYPE_NOUNS[item.type] ?? "atividade"} de ${item.subjectName}`;
  return item.title.charAt(0).toLowerCase() + item.title.slice(1);
}

/**
 * O que amanhã pede, pelo nome: as atividades de amanhã e as aulas fora da
 * escola. Até dois nomes a frase os diz; com mais, conta.
 */
export function tomorrowSentence(things: readonly string[]): string {
  const unique = [...new Set(things)];
  if (unique.length === 0) return "Amanhã está livre por enquanto.";
  if (unique.length <= 2) return `Amanhã tem ${joinWords(unique)}.`;
  return `Amanhã tem ${countWord(unique.length)} coisas.`;
}

export function routineSummary(input: {
  /** Tudo o que está em "Para hoje": de hoje, atrasado e sem data. */
  forToday: number;
  /** Quantas dessas já passaram do prazo. */
  late: number;
  /** O que amanhã pede, já descrito (`describeThing`, aulas fora da escola). */
  tomorrow: readonly string[];
  doneToday: number;
}): string {
  const { forToday, late, tomorrow, doneToday } = input;
  let first: string;
  if (forToday === 0) first = doneToday > 0 ? "Tudo de hoje está feito." : "Nada para hoje.";
  else {
    const onTime = forToday - late;
    if (onTime === 0)
      first =
        late === 1 ? "Uma passou do prazo." : `${capitalize(countWord(late))} passaram do prazo.`;
    else {
      const head = onTime === 1 ? "uma coisa para hoje" : `${countWord(onTime)} coisas para hoje`;
      const tail =
        late === 0
          ? ""
          : late === 1
            ? " e uma que passou do prazo"
            : ` e ${countWord(late)} que passaram do prazo`;
      first = `${capitalize(head)}${tail}.`;
    }
  }
  return `${first} ${tomorrowSentence(tomorrow)}`;
}

/**
 * A frase da noite, embaixo de "A mochila de amanhã": "Terça, 20. Falta uma
 * coisa de hoje." O que ainda está aberto de hoje vem logo abaixo.
 */
export function eveningSentence(input: { tomorrowLabel: string; openToday: number }): string {
  const rest =
    input.openToday === 0
      ? "Hoje está tudo em dia."
      : input.openToday === 1
        ? "Falta uma coisa de hoje."
        : `Faltam ${countWord(input.openToday)} coisas de hoje.`;
  return `${input.tomorrowLabel}. ${rest}`;
}
