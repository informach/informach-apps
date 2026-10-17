/**
 * Duração estimada: os degraus que o formulário oferece e como se lê o total.
 *
 * Fonte única porque três telas precisam concordar — o formulário oferece, o
 * card mostra e o bucket da rotina soma. Um "1h30" no card e um "90 min" no
 * cabeçalho seriam a mesma informação dita de dois jeitos.
 */

/** Degraus do formulário. Grosseiros de propósito: ninguém estima "37 minutos". */
export const ESTIMATE_PRESETS = [5, 15, 30, 60] as const;

/** "5 min", "1h", "1h30". Minutos abaixo de uma hora ficam em minutos. */
export function formatEstimate(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h${String(rest).padStart(2, "0")}`;
}

/** "30 minutos", "1h", "1h30": por extenso quando cabe numa frase ("Cerca de 30 minutos"). */
export function formatEstimateLong(minutes: number): string {
  if (minutes === 1) return "1 minuto";
  return minutes < 60 ? `${minutes} minutos` : formatEstimate(minutes);
}

/**
 * Soma as estimativas de um bucket.
 *
 * `total` ignora quem não foi estimado, e `missing` conta quantas ficaram de
 * fora — sem isso, "~45 min" numa lista em que só duas de oito têm estimativa
 * seria uma promessa falsa. Quem lê precisa saber que o número é parcial.
 */
export function sumEstimates(values: Iterable<number | null>): {
  total: number;
  counted: number;
  missing: number;
} {
  let total = 0;
  let counted = 0;
  let missing = 0;
  for (const value of values) {
    if (value === null || value <= 0) {
      missing += 1;
      continue;
    }
    total += value;
    counted += 1;
  }
  return { total, counted, missing };
}

/**
 * O rótulo do bucket: "~45 min" quando tudo está estimado, "~45 min em 3 de 8"
 * quando não. Devolve `null` quando não há nada a dizer.
 */
export function formatBucketEstimate(values: Iterable<number | null>): string | null {
  const { total, counted, missing } = sumEstimates(values);
  if (counted === 0) return null;
  const base = `~${formatEstimate(total)}`;
  return missing === 0 ? base : `${base} em ${counted} de ${counted + missing}`;
}
