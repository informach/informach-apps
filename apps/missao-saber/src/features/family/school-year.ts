/**
 * Ano escolar do estudante, sem depender de servidor.
 *
 * O perfil guarda o ano escolar confirmado pelo responsável e o ano civil a
 * que ele se refere. Em 1º de janeiro o ano efetivo avança sozinho, e as
 * trilhas elegíveis acompanham; se a família adiantou ou segurou o estudante,
 * ela corrige no perfil e o ano civil é gravado de novo.
 *
 * A sugestão usa a regra de corte nacional: seis anos completos até 31 de
 * março entram no 1º ano. Só mês e ano de nascimento bastam para isso, e é só
 * isso que o app pede; a política de privacidade promete não pedir a data
 * completa.
 *
 * Escala de `grade`: 1 a 9 são os anos do fundamental, 10 a 12 são as três
 * séries do ensino médio.
 */

export const PRIMEIRO_ANO = 1;
export const ULTIMO_ANO = 12;
export const FUSO_ESCOLAR = "America/Sao_Paulo";

/** Ano civil corrente no fuso da escola. O ano letivo vira junto com ele. */
export function schoolYear(now: Date = new Date()): number {
  return Number(
    new Intl.DateTimeFormat("en-US", { timeZone: FUSO_ESCOLAR, year: "numeric" }).format(now),
  );
}

/** "2014-03" para 31/03/2026: quem faz seis anos até 31 de março entra no 1º ano. */
export function suggestedGrade(birthMonth: string, year: number): number | null {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(birthMonth);
  if (!match) return null;
  const birthYear = Number(match[1]);
  const month = Number(match[2]);
  const ageOnCutoff = year - birthYear - (month > 3 ? 1 : 0);
  const grade = ageOnCutoff - 5;
  return grade >= PRIMEIRO_ANO && grade <= ULTIMO_ANO ? grade : null;
}

/** O ano gravado avança um por ano civil, sem passar da 3ª série do EM. */
export function effectiveGrade(
  profile: { grade: number; gradeYear: number },
  now: Date = new Date(),
): number {
  return Math.min(ULTIMO_ANO, profile.grade + Math.max(0, schoolYear(now) - profile.gradeYear));
}

const serie = (grade: number) => grade >= 10;
const ordinal = (grade: number) => (serie(grade) ? `${grade - 9}ª` : `${grade}º`);

/** "6º ano" ou "1ª série do EM". */
export function gradeLabel(grade: number): string {
  return serie(grade) ? `${ordinal(grade)} série do EM` : `${ordinal(grade)} ano`;
}

/** "no 6º ano", "na 1ª série do EM". */
export function inGrade(grade: number): string {
  return `${serie(grade) ? "na" : "no"} ${gradeLabel(grade)}`;
}

/** "do 6º ano", "da 1ª série do EM". */
export function ofGrade(grade: number): string {
  return `${serie(grade) ? "da" : "do"} ${gradeLabel(grade)}`;
}

/**
 * "6º e 7º anos", "1ª e 2ª séries do EM", "do 6º ao 9º ano",
 * "da 1ª à 3ª série do EM" ou "do 2º ano à 3ª série do EM".
 */
export function gradeRangeLabel(grades: readonly number[]): string {
  const ordered = [...new Set(grades)].sort((a, b) => a - b);
  const first = ordered[0];
  const last = ordered[ordered.length - 1];
  if (first === undefined || last === undefined) return "";
  if (ordered.length === 1) return gradeLabel(first);
  const mesmaEtapa = serie(first) === serie(last);
  const inicio = mesmaEtapa ? ordinal(first) : gradeLabel(first);
  if (ordered.length === 2)
    return mesmaEtapa
      ? `${inicio} e ${ordinal(last)} ${serie(last) ? "séries do EM" : "anos"}`
      : `${inicio} e ${gradeLabel(last)}`;
  return `${serie(first) ? "da" : "do"} ${inicio} ${serie(last) ? "à" : "ao"} ${gradeLabel(last)}`;
}

/**
 * Para frases, com "ensino médio" por extenso: "para o 6º e o 7º ano",
 * "para a 3ª série do ensino médio" ou "do 2º ano à 3ª série do ensino médio".
 */
export function gradeRangeSentence(grades: readonly number[]): string {
  const ordered = [...new Set(grades)].sort((a, b) => a - b);
  const first = ordered[0];
  const last = ordered[ordered.length - 1];
  if (first === undefined || last === undefined) return "";
  const extenso = (texto: string) => texto.replace(/ do EM$/, " do ensino médio");
  const artigo = (grade: number) => (serie(grade) ? "a" : "o");
  if (ordered.length === 1) return `para ${artigo(first)} ${extenso(gradeLabel(first))}`;
  if (ordered.length === 2)
    return serie(first) === serie(last)
      ? `para ${artigo(first)} ${ordinal(first)} e ${artigo(last)} ${extenso(gradeLabel(last))}`
      : `para o ${gradeLabel(first)} e a ${extenso(gradeLabel(last))}`;
  return extenso(gradeRangeLabel(ordered));
}

export function gradeOptions(grades: readonly number[]) {
  return [...grades].sort((a, b) => a - b).map((value) => ({ value, label: gradeLabel(value) }));
}

/** Data gravada no banco (dia 1) de volta para o valor do campo `type="month"`. */
export function birthMonthValue(stored: string | Date | null | undefined): string {
  if (!stored) return "";
  const iso = stored instanceof Date ? stored.toISOString() : String(stored);
  return iso.slice(0, 7);
}
