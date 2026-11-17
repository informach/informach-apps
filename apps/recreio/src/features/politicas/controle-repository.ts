import "server-only";
import { and, eq, sql } from "@informach/db";
import { recreioMinorDailyUsage as usage } from "@informach/db/schema";
import {
  acertarUsoDeConcessao,
  decidirTempoDoMenor,
  ErroDoRecreio,
  type PerfilId,
  type SessaoDeJogoId,
  type Supervisao,
} from "@informach/recreio";
import type { ControleDaSessao } from "@informach/recreio/contrato";
import type { Transacao } from "@/lib/repository";
import { calendarioDeBrasilia } from "./tempo-repository";

/** Só projeção de leitura. A concessão autoritativa continua sendo decidida na emissão/renovação. */
export async function consultarTempoDeJogo(
  tx: Transacao,
  perfilId: PerfilId,
  sid: SessaoDeJogoId,
  supervisao: Supervisao,
  agora: Date,
  pausaConfirmadaEm: Date | null = null,
): Promise<NonNullable<ControleDaSessao["tempo"]>> {
  const calendario = await calendarioDeBrasilia(tx, agora);
  const [dia] = await tx
    .select()
    .from(usage)
    .where(and(eq(usage.profileId, perfilId), eq(usage.localDay, calendario.dia)));
  if (!dia?.leaseUntil || dia.sessionId !== sid) throw new ErroDoRecreio("SESSAO_INVALIDA");
  const acerto = acertarUsoDeConcessao(
    {
      usadoMs: dia.usedMilliseconds,
      contabilizadoAte: dia.accountedUntil.getTime(),
      concedidoAte: dia.leaseUntil.getTime(),
    },
    agora.getTime(),
    pausaConfirmadaEm?.getTime() ?? null,
  );
  const decidir = (semana: number, minuto: number, usadoMs: number) =>
    decidirTempoDoMenor({ supervisao, instanteLocal: { diaDaSemana: semana, minuto }, usadoMs });
  const atual = decidir(calendario.semana, calendario.minuto, acerto.usadoMs);
  let pausaEm: string | null = null;
  let motivo: NonNullable<ControleDaSessao["tempo"]>["motivo"] = null;
  if (!pausaConfirmadaEm && !atual.permitido) {
    pausaEm = agora.toISOString();
    motivo = atual.motivo;
  } else if (!pausaConfirmadaEm) {
    // Horizonte fixo: aviso de até um minuto, inclusive mudança do dia e saltos IANA.
    const instantes = await tx.execute<{
      instante: string;
      dia: string;
      semana: number;
      minuto: number;
    }>(sql`
      select instante::text, to_char(local,'YYYY-MM-DD') as dia, extract(dow from local)::integer as semana,
        (extract(hour from local)::integer*60+extract(minute from local)::integer) as minuto
      from (select instante, instante at time zone 'America/Sao_Paulo' as local from generate_series(
        date_trunc('second',${agora.toISOString()}::timestamptz)+interval '1 second',
        date_trunc('second',${agora.toISOString()}::timestamptz)+interval '61 seconds', interval '1 second'
      ) serie(instante)) calendario order by instante
    `);
    for (const instante of instantes) {
      const data = new Date(instante.instante);
      if (instante.dia !== calendario.dia) {
        pausaEm = data.toISOString();
        motivo = "day_change";
        break;
      }
      const uso = acerto.usadoMs + data.getTime() - agora.getTime();
      const futura = decidir(instante.semana, instante.minuto, uso);
      if (!futura.permitido) {
        pausaEm = data.toISOString();
        motivo = futura.motivo;
        break;
      }
    }
  }
  if (pausaEm)
    pausaEm = new Date(Math.min(Date.parse(pausaEm), dia.leaseUntil.getTime())).toISOString();
  return {
    usadoHojeMs: acerto.usadoMs,
    limiteDiarioMinutos: supervisao.minutosPorDia,
    saldoMs: atual.permitido ? atual.saldoMs : 0,
    pausaEm,
    motivo,
  };
}
