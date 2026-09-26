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

export function gradeLabel(grade: number): string {
  return grade >= 10 ? `${grade - 9}ª série do EM` : `${grade}º ano`;
}

/** "6º e 7º ano", ou "do 2º ano à 3ª série do EM" quando a faixa é longa. */
export function gradeRangeLabel(grades: readonly number[]): string {
  const ordered = [...new Set(grades)].sort((a, b) => a - b);
  const first = ordered[0];
  const last = ordered[ordered.length - 1];
  if (first === undefined || last === undefined) return "";
  if (ordered.length === 1) return gradeLabel(first);
  if (ordered.length === 2)
    return `${gradeLabel(first).replace(/ ano$/, "")} e ${gradeLabel(last)}`;
  return `do ${gradeLabel(first)} ${last >= 10 ? "à" : "ao"} ${gradeLabel(last)}`;
}

/** Para frases: "para o 6º e 7º ano" ou "do 6º ano ao 9º ano". */
export function gradeRangeSentence(grades: readonly number[]): string {
  const label = gradeRangeLabel(grades);
  return label.startsWith("do ") ? label : `para o ${label}`;
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
