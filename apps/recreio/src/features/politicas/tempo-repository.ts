import "server-only";
import { and, eq, isNotNull, sql } from "@informach/db";
import {
  recreioGameSessions as games,
  recreioMinorDailyUsage as usage,
} from "@informach/db/schema";
import {
  acertarUsoDeConcessao,
  decidirTempoDoMenor,
  ErroDoRecreio,
  type PerfilId,
  type SessaoDeJogoId,
  type Supervisao,
} from "@informach/recreio";
import type { Transacao } from "@/lib/repository";

/** Teto de uma concessão infantil, inclusive durante partição de rede. */
export const CONCESSAO_INFANTIL_MAX_MS = 60_000;

/** O instante vem do relógio servidor. O calendário IANA do PostgreSQL resolve o fuso. */
export async function calendarioDeBrasilia(tx: Transacao, agora: Date) {
  const [linha] = await tx.execute<{ dia: string; semana: number; minuto: number }>(sql`
    select to_char(local,'YYYY-MM-DD') as dia,
      extract(dow from local)::integer as semana,
      (extract(hour from local)::integer*60+extract(minute from local)::integer) as minuto
    from (select ${agora.toISOString()}::timestamptz at time zone 'America/Sao_Paulo' as local) calendario
  `);
  if (!linha) throw new ErroDoRecreio("INDISPONIVEL");
  return linha;
}

/**
 * Procura somente nos próximos 61 segundos, teto fixo, incluindo saltos do fuso.
 * Evita supor UTC−3 permanente, dia de 24 h ou converter horário inexistente
 * em um prazo posterior. O token usa segundos inteiros como a fronteira.
 */
async function proximaFronteira(
  tx: Transacao,
  agora: Date,
  dia: string,
  inicioMinuto: number,
  fimMinuto: number,
) {
  const [linha] = await tx.execute<{ fim: string | null }>(sql`
    select min(instante)::text as fim
    from generate_series(
      date_trunc('second',${agora.toISOString()}::timestamptz)+interval '1 second',
      date_trunc('second',${agora.toISOString()}::timestamptz)+interval '61 seconds',
      interval '1 second'
    ) as serie(instante)
    where (instante at time zone 'America/Sao_Paulo')::date <> ${dia}::date
       or (extract(hour from instante at time zone 'America/Sao_Paulo')::integer*60
         +extract(minute from instante at time zone 'America/Sao_Paulo')::integer) >= ${fimMinuto}
       or (extract(hour from instante at time zone 'America/Sao_Paulo')::integer*60
         +extract(minute from instante at time zone 'America/Sao_Paulo')::integer) < ${inicioMinuto}
  `);
  return linha?.fim ? new Date(linha.fim).getTime() : Number.POSITIVE_INFINITY;
}

/** Perfil em UPDATE desde a entrada; encerra a correlação antes de abrir outro intervalo. */
async function acertarConcessaoAnterior(tx: Transacao, perfilId: PerfilId, agora: Date) {
  const abertas = await tx
    .select()
    .from(usage)
    .where(and(eq(usage.profileId, perfilId), isNotNull(usage.leaseUntil)))
    .limit(2)
    .for("update");
  if (abertas.length > 1) throw new ErroDoRecreio("INDISPONIVEL");
  const anterior = abertas[0];
  if (!anterior) return;
  const [sessao] = anterior.sessionId
    ? await tx
        .select({
          profileId: games.profileId,
          endedAt: games.endedAt,
          checkpointFrozenAt: games.checkpointFrozenAt,
        })
        .from(games)
        .where(eq(games.id, anterior.sessionId))
    : [];
  if (!sessao || sessao.profileId !== perfilId || !anterior.leaseUntil)
    throw new ErroDoRecreio("INDISPONIVEL");
  const acerto = acertarUsoDeConcessao(
    {
      usadoMs: anterior.usedMilliseconds,
      contabilizadoAte: anterior.accountedUntil.getTime(),
      concedidoAte: anterior.leaseUntil.getTime(),
    },
    agora.getTime(),
    sessao.checkpointFrozenAt && (!sessao.endedAt || sessao.checkpointFrozenAt < sessao.endedAt)
      ? sessao.checkpointFrozenAt.getTime()
      : (sessao.endedAt?.getTime() ?? null),
  );
  await tx
    .update(usage)
    .set({
      usedMilliseconds: acerto.usadoMs,
      accountedUntil: new Date(acerto.contabilizadoAte),
      leaseUntil: null,
      sessionId: null,
      updatedAt: agora,
    })
    .where(and(eq(usage.profileId, perfilId), eq(usage.localDay, anterior.localDay)));
}

/**
 * Chamar sob a trava UPDATE do perfil e confirmar também uma recusa para
 * preservar o acerto já devido. Não lança uma recusa de orçamento dentro da TX.
 */
export async function prepararConcessaoDeTempo(
  tx: Transacao,
  perfilId: PerfilId,
  supervisao: Supervisao,
  agora: Date,
) {
  await acertarConcessaoAnterior(tx, perfilId, agora);
  const calendario = await calendarioDeBrasilia(tx, agora);
  const [atual] = await tx
    .select()
    .from(usage)
    .where(and(eq(usage.profileId, perfilId), eq(usage.localDay, calendario.dia)))
    .for("update");
  const decisao = decidirTempoDoMenor({
    supervisao,
    instanteLocal: { diaDaSemana: calendario.semana, minuto: calendario.minuto },
    usadoMs: atual?.usedMilliseconds ?? 0,
  });
  if (!decisao.permitido) return decisao;
  const fronteira = await proximaFronteira(
    tx,
    agora,
    calendario.dia,
    decisao.desdeMinutoLocal,
    decisao.ateMinutoLocal,
  );
  const prazo =
    Math.floor(
      Math.min(
        agora.getTime() + CONCESSAO_INFANTIL_MAX_MS,
        fronteira,
        agora.getTime() + (decisao.saldoMs ?? Infinity),
      ) / 1000,
    ) * 1000;
  if (prazo <= agora.getTime())
    return { permitido: false as const, motivo: "daily_limit" as const };
  return {
    permitido: true as const,
    dia: calendario.dia,
    agora,
    expiraEm: new Date(prazo),
    usadoMs: atual?.usedMilliseconds ?? 0,
  };
}

type ConcessaoPreparada = Extract<
  Awaited<ReturnType<typeof prepararConcessaoDeTempo>>,
  { permitido: true }
>;

/** A sessão precisa existir na mesma transação, e o prazo persistido é o do token assinado. */
export async function registrarConcessaoDeTempo(
  tx: Transacao,
  perfilId: PerfilId,
  sid: SessaoDeJogoId,
  preparada: ConcessaoPreparada,
  prazoAssinado: Date,
) {
  if (
    prazoAssinado <= preparada.agora ||
    prazoAssinado > preparada.expiraEm ||
    prazoAssinado.getTime() % 1000 !== 0
  )
    throw new ErroDoRecreio("INDISPONIVEL");
  await tx
    .insert(usage)
    .values({
      profileId: perfilId,
      localDay: preparada.dia,
      usedMilliseconds: preparada.usadoMs,
      accountedUntil: preparada.agora,
      leaseUntil: prazoAssinado,
      sessionId: sid,
      updatedAt: preparada.agora,
    })
    .onConflictDoUpdate({
      target: [usage.profileId, usage.localDay],
      set: {
        usedMilliseconds: preparada.usadoMs,
        accountedUntil: preparada.agora,
        leaseUntil: prazoAssinado,
        sessionId: sid,
        updatedAt: preparada.agora,
      },
    });
}
