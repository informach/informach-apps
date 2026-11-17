import { and, db, eq, sql } from "@informach/db";
import {
  recreioGameSessions as games,
  recreioSessionSavePermits as permits,
  recreioProfiles as profiles,
  sessions,
  recreioMinorDailyUsage as usage,
} from "@informach/db/schema";
import { VERSAO_DA_RESPONSABILIDADE } from "@informach/recreio";
import { describe, expect, it, vi } from "vitest";
import { cadastrarPerfilMenor, prepararPerfilMenor } from "@/features/familia/service";
import { consultarSupervisao, salvarSupervisao } from "@/features/politicas/service";
import {
  prepararConcessaoDeTempo,
  registrarConcessaoDeTempo,
} from "@/features/politicas/tempo-repository";
import { lerUsoRecente } from "@/features/politicas/uso-repository";
import {
  aprovarPareamento,
  consultarPareamento,
  prepararPareamento,
} from "@/features/protecao/service";
import { registrarMargemDeSalvamento } from "@/features/salvamento/tempo-repository";
import { resolverAtor } from "@/features/sessao/service";
import {
  emitirIngresso,
  sessaoDeJogoDoToken,
  trocarIngresso,
} from "@/features/sessao-de-jogo/service";
import { chavesDoRecreio } from "@/lib/tokens";
import { conceder } from "../scripts/concessoes";
import { loginReal, novaConta } from "./apoio";
import { pedir } from "./rotas";

vi.mock("@/lib/env", async (original) => {
  const real = await original<typeof import("@/lib/env")>();
  return { ...real, env: { ...real.env, RECREIO_CHECKPOINT_MODE: "on" } };
});
vi.mock("@informach/config/jogos", async (original) => {
  const real = await original<typeof import("@informach/config/jogos")>();
  const jogos = [
    ...real.JOGOS,
    {
      ...real.JOGOS[0],
      id: "tempo-salvamento",
      nome: "Margem protegida",
      rota: "/jogar/tempo-salvamento",
      classificacao: { faixa: "L", descritores: [], interacoes: [] },
      capacidades: {
        ...real.JOGOS[0].capacidades,
        mundos: null,
        posse: [],
        dadosDePerfil: true,
        checkpoint: "perfil",
      },
    },
  ];
  return {
    ...real,
    JOGOS: jogos,
    jogoPorId: (id: string) => jogos.find((j) => j.id === id) ?? null,
  };
});
const JOGO = "tempo-salvamento";
let ip = 1;
async function preparar() {
  const conta = await novaConta();
  const login = await loginReal(conta);
  const contexto = await resolverAtor(login);
  const [sessaoNativa] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, login.authSessionId));
  if (!contexto || !sessaoNativa) throw new Error("Conta ausente");
  const autor = {
    ...contexto.ator,
    login: {
      authSessionId: sessaoNativa.id,
      criadoEm: sessaoNativa.createdAt,
      expiraEm: sessaoNativa.expiresAt,
    },
  };
  const intencao = await prepararPerfilMenor(autor);
  const { perfil } = await cadastrarPerfilMenor(autor, {
    intencaoId: intencao.id,
    perfil: { apelido: "Margem", avatar: "padrao" },
    nascimento: { ano: new Date().getUTCFullYear() - 8, mes: 1 },
    assumoResponsabilidade: true,
    versaoDaDeclaracao: VERSAO_DA_RESPONSABILIDADE,
  });
  await conceder({ email: conta.email, tier: "family", dias: 30, motivo: "teste" });
  const supervisao = await consultarSupervisao(autor, perfil.id);
  await salvarSupervisao(autor, {
    perfilId: perfil.id,
    versao: supervisao.versao,
    configuracao: supervisao.configuracao,
    reconheco: true,
  });
  const pedido = await prepararPareamento(`203.0.113.${ip++}`);
  const pareado = await aprovarPareamento(autor, { perfilId: perfil.id, codigo: pedido.codigo });
  await consultarPareamento(pedido.segredo);
  const ator = { perfil, sessaoDeAparelhoId: pareado.aparelhoId };
  const ingresso = await emitirIngresso(ator, { jogo: JOGO });
  const aberta = await trocarIngresso({ ingresso: ingresso.ingresso, suportaSalvamento: true });
  const sessao = await sessaoDeJogoDoToken(aberta.token);
  const [recibo] = await db.select().from(permits).where(eq(permits.sessionId, sessao.sid));
  if (!recibo) throw new Error("Recibo ausente");
  return { autor, ator, perfil, supervisao, aberta, sessao, recibo };
}

describe("margem de salvar separada do tempo de jogo", () => {
  it("confirma uma vez, reverte o agregado em falha de auditoria e preserva-o na próxima concessão", async () => {
    const r = await preparar();
    const corte = new Date(Math.floor(Date.now() / 1000) * 1000 - 1000);
    const inicio = new Date(corte.getTime() - 30_000);
    const { emissor } = await chavesDoRecreio();
    const capacidade = await emissor.salvamento({
      ...r.sessao,
      reciboId: r.recibo.id,
      agora: inicio,
      fimDaConcessao: corte,
    });
    await db
      .update(games)
      .set({ startedAt: inicio, lastRenewedAt: inicio, expiresAt: corte })
      .where(eq(games.id, r.sessao.sid));
    await db
      .update(permits)
      .set({
        createdAt: inicio,
        renewedAt: inicio,
        cutoffAt: corte,
        expiresAt: capacidade.expiraEm,
      })
      .where(eq(permits.id, r.recibo.id));
    await db
      .update(usage)
      .set({ accountedUntil: inicio, leaseUntil: corte })
      .where(eq(usage.profileId, r.perfil.id));
    const antes = await db.select().from(usage).where(eq(usage.profileId, r.perfil.id));
    const salvar = () =>
      pedir("POST", "/api/sdk/v1/sessao/salvamento", {
        token: capacidade.token,
        corpo: { dados: [] },
      });
    await db.execute(
      sql`create function audit.recusar_agregado_salvamento() returns trigger language plpgsql as $$ begin if new.event_type='recreio.session_save_completed' then raise exception 'audit unavailable'; end if; return new; end $$`,
    );
    await db.execute(
      sql`create trigger recusar_agregado_salvamento before insert on audit.events for each row execute function audit.recusar_agregado_salvamento()`,
    );
    try {
      expect((await salvar()).status).toBe(503);
      expect(await db.select().from(usage).where(eq(usage.profileId, r.perfil.id))).toEqual(antes);
    } finally {
      await db.execute(sql`drop trigger recusar_agregado_salvamento on audit.events`);
      await db.execute(sql`drop function audit.recusar_agregado_salvamento()`);
    }
    expect((await salvar()).status).toBe(200);
    const depois = await db.select().from(usage).where(eq(usage.profileId, r.perfil.id));
    expect(depois[0]?.savingMilliseconds).toBeGreaterThanOrEqual(1000);
    expect(depois[0]?.savingMilliseconds).toBeLessThan(30_000);
    expect(depois[0]?.usedMilliseconds).toBe(0);
    expect((await salvar()).status).toBe(200);
    expect(await db.select().from(usage).where(eq(usage.profileId, r.perfil.id))).toEqual(depois);
    const visao = await consultarSupervisao(r.autor, r.perfil.id);
    expect(visao.usoRecente).toEqual([
      { dia: depois[0]?.localDay, jogandoMs: 30_000, salvandoMs: depois[0]?.savingMilliseconds },
    ]);
    expect(await db.select().from(usage).where(eq(usage.profileId, r.perfil.id))).toEqual(depois);
    const outraConta = await novaConta();
    const outra = await resolverAtor(await loginReal(outraConta));
    if (!outra) throw new Error("Outra conta ausente");
    await expect(consultarSupervisao(outra.ator, r.perfil.id)).rejects.toMatchObject({
      code: "PERFIL",
    });
    const ingresso = await emitirIngresso(r.ator, { jogo: JOGO });
    const nova = await trocarIngresso({ ingresso: ingresso.ingresso, suportaSalvamento: true });
    expect((await sessaoDeJogoDoToken(nova.token)).sid).not.toBe(r.sessao.sid);
    const [atual] = await db.select().from(usage).where(eq(usage.profileId, r.perfil.id));
    expect(atual?.usedMilliseconds).toBe(30_000);
    expect(atual?.savingMilliseconds).toBe(depois[0]?.savingMilliseconds);
  });
  it("margem que cruza meia-noite pertence ao dia da concessão e não ao novo orçamento", async () => {
    const r = await preparar();
    await db.delete(usage).where(eq(usage.profileId, r.perfil.id));
    await db.transaction(async (tx) => {
      await tx.select().from(profiles).where(eq(profiles.id, r.perfil.id)).for("update");
      const inicio = new Date("2026-11-17T02:59:45Z");
      const tempo = await prepararConcessaoDeTempo(
        tx,
        r.perfil.id,
        r.supervisao.configuracao,
        inicio,
      );
      if (!tempo.permitido) throw new Error("Concessão recusada");
      await registrarConcessaoDeTempo(tx, r.perfil.id, r.sessao.sid, tempo, tempo.expiraEm);
      await registrarMargemDeSalvamento(tx, {
        perfilId: r.perfil.id,
        sid: r.sessao.sid,
        corteEm: new Date("2026-11-17T03:00:00Z"),
        concluidaEm: new Date("2026-11-17T03:00:05Z"),
      });
    });
    const [antigo] = await db.select().from(usage).where(eq(usage.profileId, r.perfil.id));
    expect(antigo).toMatchObject({
      localDay: "2026-11-16",
      usedMilliseconds: 0,
      savingMilliseconds: 5000,
    });
    const visao = await db.transaction(async (tx) => {
      await tx.select().from(profiles).where(eq(profiles.id, r.perfil.id)).for("update");
      return lerUsoRecente(tx, r.perfil.id, new Date("2026-11-17T03:00:05Z"));
    });
    expect(visao).toEqual([{ dia: "2026-11-16", jogandoMs: 15_000, salvandoMs: 5000 }]);
    expect(
      await db
        .select()
        .from(usage)
        .where(and(eq(usage.profileId, r.perfil.id), eq(usage.localDay, "2026-11-17"))),
    ).toEqual([]);
  });
});
