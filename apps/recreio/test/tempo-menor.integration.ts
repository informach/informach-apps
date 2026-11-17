import { db, eq, sql } from "@informach/db";
import {
  recreioDeviceSessions as devices,
  recreioGameSessions as games,
  recreioProfiles as profiles,
  recreioMinorDailyUsage as usage,
} from "@informach/db/schema";
import {
  SessaoDeJogoIdSchema,
  type Supervisao,
  supervisaoInicial,
  VERSAO_DA_RESPONSABILIDADE,
} from "@informach/recreio";
import { describe, expect, it } from "vitest";
import { cadastrarPerfilMenor, prepararPerfilMenor } from "@/features/familia/service";
import { apagarUsoAntigo } from "@/features/manutencao/repository";
import { consultarTempoDeJogo } from "@/features/politicas/controle-repository";
import {
  calendarioDeBrasilia,
  prepararConcessaoDeTempo,
  registrarConcessaoDeTempo,
} from "@/features/politicas/tempo-repository";
import { resolverAtor } from "@/features/sessao/service";
import { loginReal, novaConta } from "./apoio";

async function familia() {
  const conta = await novaConta();
  const login = await loginReal(conta);
  const contexto = await resolverAtor(login);
  if (!contexto) throw new Error("Login ausente");
  const autor = { ...contexto.ator, login: { ...login, criadoEm: new Date() } };
  const intencao = await prepararPerfilMenor(autor);
  const { perfil } = await cadastrarPerfilMenor(autor, {
    intencaoId: intencao.id,
    perfil: { apelido: "Protegido", avatar: "padrao" },
    nascimento: { ano: new Date().getUTCFullYear() - 8, mes: 1 },
    assumoResponsabilidade: true,
    versaoDaDeclaracao: VERSAO_DA_RESPONSABILIDADE,
  });
  const [outro] = await db
    .insert(devices)
    .values({ kind: "paired_device", activeProfileId: perfil.id, expiresAt: login.expiraEm })
    .returning();
  if (!outro) throw new Error("Aparelho ausente");
  const [primeira, segunda] = await db
    .insert(games)
    .values(
      [autor.sessaoDeAparelhoId, outro.id].map((deviceId) => ({
        profileId: perfil.id,
        deviceSessionId: deviceId,
        gameId: "perfil-teste",
        startedAt: new Date("2010-01-01T00:00:00Z"),
        lastRenewedAt: new Date("2010-01-01T00:00:00Z"),
        expiresAt: new Date("2030-01-01T00:00:00Z"),
        endedAt: new Date("2020-01-01T00:00:00Z"),
        endReason: "left" as const,
        endedSeq: sql`nextval('recreio.game_session_end_seq')`,
      })),
    )
    .returning();
  if (!primeira || !segunda) throw new Error("Sessões ausentes");
  // São fatos históricos terminados: o teste de contagem não cria duas partidas abertas.
  return { perfil, primeira, segunda };
}
async function preparar(
  r: Awaited<ReturnType<typeof familia>>,
  agora: string,
  supervisao: Supervisao,
  sid?: string,
) {
  return db.transaction(async (tx) => {
    await tx.select().from(profiles).where(eq(profiles.id, r.perfil.id)).for("update");
    const preparada = await prepararConcessaoDeTempo(tx, r.perfil.id, supervisao, new Date(agora));
    if (preparada.permitido && sid)
      await registrarConcessaoDeTempo(
        tx,
        r.perfil.id,
        SessaoDeJogoIdSchema.parse(sid),
        preparada,
        preparada.expiraEm,
      );
    return preparada;
  });
}
describe("concessão de tempo por perfil", () => {
  it.each([
    {
      agora: "2018-11-03T15:00:00.250Z",
      pausa: "2018-11-03T15:10:00.250Z",
      motivo: "daily_limit",
      minutosPorDia: 10,
      horarios: null,
    },
    {
      agora: "2018-11-03T15:00:00Z",
      pausa: "2018-11-03T15:09:00.000Z",
      motivo: "schedule",
      minutosPorDia: null,
      horarios: [{ diaDaSemana: 6, inicioMinuto: 720, fimMinuto: 729 }],
    },
    {
      agora: "2018-11-04T02:51:00Z",
      pausa: "2018-11-04T03:00:00.000Z",
      motivo: "day_change",
      minutosPorDia: null,
      horarios: null,
    },
    {
      agora: "2019-02-17T01:51:00Z",
      pausa: "2019-02-17T02:00:00.000Z",
      motivo: "schedule",
      minutosPorDia: null,
      horarios: [{ diaDaSemana: 6, inicioMinuto: 1410, fimMinuto: 1440 }],
    },
    { agora: "2018-11-03T15:00:00Z", pausa: null, motivo: null, minutosPorDia: 11, horarios: null },
  ])(
    "aviso de dez minutos separado da concessão curta: $agora / $motivo",
    async ({ agora, pausa, motivo, minutosPorDia, horarios }) => {
      const r = await familia();
      const configuracao = { ...supervisaoInicial(), minutosPorDia, horarios };
      const preparada = await preparar(r, agora, configuracao, r.primeira.id);
      if (!preparada.permitido) throw new Error("Concessão inicial recusada");
      expect(preparada.expiraEm.getTime() - Date.parse(agora)).toBeLessThanOrEqual(60_000);
      const antes = await db.select().from(usage).where(eq(usage.profileId, r.perfil.id));
      const controle = await db.transaction((tx) =>
        consultarTempoDeJogo(
          tx,
          r.perfil.id,
          SessaoDeJogoIdSchema.parse(r.primeira.id),
          configuracao,
          new Date(agora),
        ),
      );
      expect(controle).toMatchObject({ pausaEm: pausa, motivo });
      expect(await db.select().from(usage).where(eq(usage.profileId, r.perfil.id))).toEqual(antes);
    },
  );
  it("barreira confirmada para de consumir tempo antes do fim definitivo da sessão", async () => {
    const r = await familia();
    const inicio = Date.parse("2018-11-03T15:00:00Z");
    const configuracao = { ...supervisaoInicial(), minutosPorDia: 1 };
    await preparar(r, new Date(inicio).toISOString(), configuracao, r.primeira.id);
    const pausadaEm = new Date(inicio + 10_000);
    await db
      .update(games)
      .set({ checkpointFrozenAt: pausadaEm })
      .where(eq(games.id, r.primeira.id));
    const controle = await db.transaction((tx) =>
      consultarTempoDeJogo(
        tx,
        r.perfil.id,
        SessaoDeJogoIdSchema.parse(r.primeira.id),
        configuracao,
        new Date(inicio + 20_000),
        pausadaEm,
      ),
    );
    expect(controle).toMatchObject({
      usadoHojeMs: 10_000,
      saldoMs: 50_000,
      pausaEm: null,
      motivo: null,
    });
    expect(
      await preparar(r, new Date(inicio + 30_000).toISOString(), configuracao, r.segunda.id),
    ).toMatchObject({ permitido: true, usadoMs: 10_000 });
  });
  it.each([
    {
      agora: "2018-11-04T02:59:40Z",
      pausa: "2018-11-04T03:00:00.000Z",
      motivo: "day_change",
      horarios: null,
    },
    {
      agora: "2019-02-17T01:59:40Z",
      pausa: "2019-02-17T02:00:00.000Z",
      motivo: "schedule",
      horarios: [{ diaDaSemana: 6, inicioMinuto: 1430, fimMinuto: 1440 }],
    },
  ])(
    "controle antecipa fronteira IANA sem alterar o agregado: $agora",
    async ({ agora, pausa, motivo, horarios }) => {
      const r = await familia();
      const configuracao = { ...supervisaoInicial(), horarios };
      await preparar(r, agora, configuracao, r.primeira.id);
      const antes = await db.select().from(usage).where(eq(usage.profileId, r.perfil.id));
      const controle = await db.transaction((tx) =>
        consultarTempoDeJogo(
          tx,
          r.perfil.id,
          SessaoDeJogoIdSchema.parse(r.primeira.id),
          configuracao,
          new Date(agora),
        ),
      );
      expect(controle).toMatchObject({ pausaEm: pausa, motivo });
      expect(await db.select().from(usage).where(eq(usage.profileId, r.perfil.id))).toEqual(antes);
    },
  );
  it("retenção global é limitada a 500 dias por lote e não remove agregados atuais", async () => {
    await db.delete(usage);
    const r = await familia();
    await db.execute(sql`insert into recreio.minor_daily_usage(profile_id,local_day,used_milliseconds)
      select ${r.perfil.id}::uuid,(clock_timestamp() at time zone 'America/Sao_Paulo')::date-n,1000
      from generate_series(31,531) as antigos(n)`);
    await db.execute(sql`insert into recreio.minor_daily_usage(profile_id,local_day,used_milliseconds)
      values (${r.perfil.id}::uuid,(clock_timestamp() at time zone 'America/Sao_Paulo')::date-30,3000)`);
    expect(await apagarUsoAntigo()).toBe(500);
    expect(await apagarUsoAntigo()).toBe(1);
    expect(await apagarUsoAntigo()).toBe(0);
    expect(
      (await db.select().from(usage).where(eq(usage.profileId, r.perfil.id))).map(
        (d) => d.usedMilliseconds,
      ),
    ).toEqual([3000]);
  });
  it.each([
    ["2026-11-17T02:59:59Z", "2026-11-16", 1, 1439],
    ["2026-11-17T03:00:00Z", "2026-11-17", 2, 0],
    ["2018-11-04T02:59:59Z", "2018-11-03", 6, 1439],
    ["2018-11-04T03:00:00Z", "2018-11-04", 0, 60],
    ["2019-02-17T01:59:59Z", "2019-02-16", 6, 1439],
    ["2019-02-17T02:00:00Z", "2019-02-16", 6, 1380],
  ] as const)("calendário IANA em %s", async (instante, dia, semana, minuto) => {
    expect(await db.transaction((tx) => calendarioDeBrasilia(tx, new Date(instante)))).toEqual({
      dia,
      semana,
      minuto,
    });
  });
  it("limita a concessão na virada do dia inclusive quando o relógio pula uma hora", async () => {
    const r = await familia();
    for (const agora of ["2026-11-17T02:59:45Z", "2018-11-04T02:59:45Z"]) {
      const resultado = await preparar(r, agora, supervisaoInicial());
      expect(resultado).toMatchObject({
        permitido: true,
        expiraEm: new Date(agora.replace("02:59:45", "03:00:00")),
      });
    }
  });
  it("recusa hora inexistente e corta a concessão quando o relógio volta antes do começo permitido", async () => {
    const r = await familia();
    expect(
      await preparar(r, "2018-11-04T03:00:00Z", {
        ...supervisaoInicial(),
        horarios: [{ diaDaSemana: 0, inicioMinuto: 0, fimMinuto: 60 }],
      }),
    ).toEqual({ permitido: false, motivo: "schedule" });
    expect(
      await preparar(r, "2019-02-17T01:59:45Z", {
        ...supervisaoInicial(),
        horarios: [{ diaDaSemana: 6, inicioMinuto: 1410, fimMinuto: 1440 }],
      }),
    ).toMatchObject({ permitido: true, expiraEm: new Date("2019-02-17T02:00:00Z") });
  });
  it("saldo é agregado entre aparelhos, renovação não duplica uso e silêncio só consome até o prazo", async () => {
    const r = await familia();
    // Fim conhecido ao final de cada concessão, sem precisar de tempo de parede no teste.
    await db
      .update(games)
      .set({ endedAt: new Date("2026-11-17T15:02:00Z") })
      .where(eq(games.id, r.primeira.id));
    await db
      .update(games)
      .set({ endedAt: new Date("2026-11-17T15:04:00Z") })
      .where(eq(games.id, r.segunda.id));
    const supervisao = { ...supervisaoInicial(), minutosPorDia: 2 };
    expect(await preparar(r, "2026-11-17T15:00:00Z", supervisao, r.primeira.id)).toMatchObject({
      permitido: true,
      usadoMs: 0,
      expiraEm: new Date("2026-11-17T15:01:00Z"),
    });
    expect(await preparar(r, "2026-11-17T15:00:30Z", supervisao, r.primeira.id)).toMatchObject({
      permitido: true,
      usadoMs: 30000,
    });
    expect(await preparar(r, "2026-11-17T15:00:30Z", supervisao, r.primeira.id)).toMatchObject({
      permitido: true,
      usadoMs: 30000,
    });
    expect(await preparar(r, "2026-11-17T15:03:00Z", supervisao, r.segunda.id)).toMatchObject({
      permitido: true,
      usadoMs: 90000,
      expiraEm: new Date("2026-11-17T15:03:30Z"),
    });
    expect(await preparar(r, "2026-11-17T15:10:00Z", supervisao)).toEqual({
      permitido: false,
      motivo: "daily_limit",
    });
    expect(
      (await db.select().from(usage).where(eq(usage.profileId, r.perfil.id)))[0],
    ).toMatchObject({ usedMilliseconds: 120000, leaseUntil: null, sessionId: null });
  });
  it("saída confirmada acerta o intervalo anterior e preserva o agregado ao trocar de dia", async () => {
    const r = await familia();
    await db
      .update(games)
      .set({ endedAt: new Date("2026-11-17T02:59:55Z") })
      .where(eq(games.id, r.primeira.id));
    await preparar(r, "2026-11-17T02:59:45Z", supervisaoInicial(), r.primeira.id);
    const resultado = await preparar(r, "2026-11-17T03:00:05Z", supervisaoInicial());
    expect(resultado).toMatchObject({ permitido: true, dia: "2026-11-17", usadoMs: 0 });
    expect(
      (await db.select().from(usage).where(eq(usage.profileId, r.perfil.id)))[0],
    ).toMatchObject({ localDay: "2026-11-16", usedMilliseconds: 10000, sessionId: null });
  });
  it("falha antes do commit não consome orçamento nem conserva correlação de sessão", async () => {
    const r = await familia();
    await expect(
      db.transaction(async (tx) => {
        await tx.select().from(profiles).where(eq(profiles.id, r.perfil.id)).for("update");
        const preparada = await prepararConcessaoDeTempo(
          tx,
          r.perfil.id,
          supervisaoInicial(),
          new Date("2026-11-17T15:00:00Z"),
        );
        if (!preparada.permitido) throw new Error("Concessão recusada");
        await registrarConcessaoDeTempo(
          tx,
          r.perfil.id,
          SessaoDeJogoIdSchema.parse(r.primeira.id),
          preparada,
          preparada.expiraEm,
        );
        throw new Error("assinatura indisponível");
      }),
    ).rejects.toThrow("assinatura indisponível");
    expect(await db.select().from(usage).where(eq(usage.profileId, r.perfil.id))).toEqual([]);
  });
});
