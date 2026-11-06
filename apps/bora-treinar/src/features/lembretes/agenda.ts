import { inicioDaSemana, relogioLocal, somarDias } from "@/lib/datas";

export interface PreferenciasFamilia {
  reminderDays: number;
  reminderHour: number;
  timezone: string;
  weeklySummary: boolean;
  weeklySummaryWeek: string | null;
}

/** Hora local a partir da qual o resumo de segunda pode sair. */
export const HORA_DO_RESUMO = 8;
/**
 * Quantas horas depois da hora marcada o lembrete ainda sai. A rotina roda de hora em hora; se
 * uma rodada falha (ou passa do orçamento), a seguinte manda. A chave da mensagem (família + dia)
 * impede o segundo envio no mesmo dia, e depois desse prazo o lembrete já não ajuda.
 */
export const TOLERANCIA_DO_LEMBRETE = 3;

/**
 * O que a rotina horária deve fazer por uma família agora. O lembrete sai na
 * hora escolhida; o resumo sai a partir das 8h de segunda e é tentado a cada
 * hora até ser marcado como feito.
 */
export function oQueEnviar(p: PreferenciasFamilia, agora: Date) {
  const relogio = relogioLocal(agora, p.timezone);
  const lembrete =
    (p.reminderDays & (1 << relogio.diaDaSemana)) !== 0 &&
    relogio.hora >= p.reminderHour &&
    relogio.hora < p.reminderHour + TOLERANCIA_DO_LEMBRETE
      ? relogio.data
      : null;
  const semana = inicioDaSemana(agora, p.timezone);
  const resumo =
    p.weeklySummary &&
    relogio.diaDaSemana === 1 &&
    relogio.hora >= HORA_DO_RESUMO &&
    p.weeklySummaryWeek !== semana
      ? { semana, anterior: somarDias(semana, -7) }
      : null;
  return { lembrete, resumo };
}
