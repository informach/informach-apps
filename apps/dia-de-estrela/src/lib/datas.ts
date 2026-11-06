/**
 * Datas no fuso da família. O servidor roda em UTC; "hoje", "semana" e
 * "sequência de dias" precisam ser os do relógio da casa.
 */
export const FUSO_PADRAO = "America/Sao_Paulo";
const DIA = 86_400_000;

const formatadores = new Map<string, Intl.DateTimeFormat>();
function formatador(fuso: string) {
  let f = formatadores.get(fuso);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone: fuso,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
      weekday: "short",
    });
    formatadores.set(fuso, f);
  }
  return f;
}

const DIAS_DA_SEMANA = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Data (AAAA-MM-DD), hora (0–23) e dia da semana (0 = domingo) locais. */
export function relogioLocal(instante: Date | number, fuso = FUSO_PADRAO) {
  const partes = Object.fromEntries(
    formatador(fuso)
      .formatToParts(new Date(instante))
      .map((p) => [p.type, p.value]),
  );
  return {
    data: `${partes.year}-${partes.month}-${partes.day}`,
    hora: Number(partes.hour),
    diaDaSemana: DIAS_DA_SEMANA.indexOf(partes.weekday ?? ""),
  };
}

/** Número do dia local (dias desde 1970-01-01 no calendário da casa). */
export function numeroDoDia(instante: Date | number, fuso = FUSO_PADRAO) {
  return Math.round(Date.parse(`${relogioLocal(instante, fuso).data}T00:00:00Z`) / DIA);
}

const dataDoNumero = (n: number) => new Date(n * DIA).toISOString().slice(0, 10);

/** Segunda-feira local da semana do instante, em AAAA-MM-DD. */
export function inicioDaSemana(instante: Date | number, fuso = FUSO_PADRAO) {
  const { diaDaSemana } = relogioLocal(instante, fuso);
  return dataDoNumero(numeroDoDia(instante, fuso) - ((diaDaSemana + 6) % 7));
}

/** Instante UTC em que começa (00:00 local) a data AAAA-MM-DD, com precisão de hora cheia. */
export function inicioDoDiaLocal(data: string, fuso = FUSO_PADRAO) {
  const meiaNoiteUtc = Date.parse(`${data}T00:00:00Z`);
  // o deslocamento do fuso é achado comparando a hora local daquele instante
  const { hora, data: dataLocal } = relogioLocal(meiaNoiteUtc, fuso);
  const deslocamento = dataLocal === data ? hora : hora - 24;
  return new Date(meiaNoiteUtc - deslocamento * 3_600_000);
}

export const somarDias = (data: string, dias: number) =>
  dataDoNumero(Math.round(Date.parse(`${data}T00:00:00Z`) / DIA) + dias);

/** Dias seguidos com treino, terminando hoje ou ontem, no fuso da casa. */
export function sequenciaDeDias(instantes: number[], agora = Date.now(), fuso = FUSO_PADRAO) {
  const dias = new Set(instantes.map((t) => numeroDoDia(t, fuso)));
  let dia = numeroDoDia(agora, fuso);
  if (!dias.has(dia)) dia -= 1;
  let n = 0;
  while (dias.has(dia)) {
    n += 1;
    dia -= 1;
  }
  return n;
}
