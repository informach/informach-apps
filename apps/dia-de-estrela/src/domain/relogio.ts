import type { Relogio } from "./rotina";

export const FUSO_PADRAO = "America/Sao_Paulo";
const formatadores = new Map<string, Intl.DateTimeFormat>();
const DIAS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatador(fuso: string) {
  let f = formatadores.get(fuso);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone: fuso,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
      weekday: "short",
    });
    formatadores.set(fuso, f);
  }
  return f;
}

/** O instante lido no relógio da casa (fuso da família), sem depender do fuso do aparelho. */
export function relogioDa(ms: number, fuso = FUSO_PADRAO): Relogio {
  const p = Object.fromEntries(
    formatador(fuso)
      .formatToParts(new Date(ms))
      .map((parte) => [parte.type, parte.value]),
  );
  const minutos =
    Number(p.hour) * 60 + Number(p.minute) + Number(p.second) / 60 + (ms % 1000) / 60_000;
  return {
    ms,
    data: `${p.year}-${p.month}-${p.day}`,
    diaDaSemana: DIAS.indexOf(p.weekday ?? ""),
    minutos,
  };
}

export function fusoValido(fuso: string) {
  try {
    new Intl.DateTimeFormat("pt-BR", { timeZone: fuso });
    return true;
  } catch {
    return false;
  }
}

export function saudacao(agora: Relogio) {
  return agora.minutos < 12 * 60 ? "Bom dia" : agora.minutos < 18 * 60 ? "Boa tarde" : "Boa noite";
}

export function dataPorExtenso(data: string) {
  const texto = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(`${data}T12:00:00Z`));
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** Dia anterior/seguinte em AAAA-MM-DD, sem fuso. */
export function somarDias(data: string, dias: number) {
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
