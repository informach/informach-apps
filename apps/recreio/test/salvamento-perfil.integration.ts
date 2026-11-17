import { randomUUID } from "node:crypto";
import { and, db, eq, sql } from "@informach/db";
import {
  recreioDeviceSessions as devices,
  recreioGameSessions as games,
  recreioSessionSavePermits as permits,
  recreioProfiles as profiles,
  recreioProfileDataVersions as versions,
} from "@informach/db/schema";
import { describe, expect, it, vi } from "vitest";
import { alterarDados } from "@/features/dados-de-perfil/service";
import {
  emitirIngresso,
  sessaoDeJogoDoToken,
  trocarIngresso,
} from "@/features/sessao-de-jogo/service";
import { chavesDoRecreio } from "@/lib/tokens";
import { eventosCom, novoJogador } from "./apoio";
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
      id: "salvamento-perfil",
      nome: "Salvamento",
      rota: "/jogar/salvamento-perfil",
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
    jogoPorId: (id: string) => jogos.find((jogo) => jogo.id === id) ?? null,
  };
});
const JOGO = "salvamento-perfil";
const gravacao = { operacao: "gravar", chave: "pontos", revisao: 0, conteudo: "MQ==" };

/** Recibo e token controlados da fixture: a emissão automática ainda é outro incremento. */
async function preparar(opcoes: { curta?: boolean; expiraDuranteAuditoria?: boolean } = {}) {
  const pessoa = await novoJogador();
  const ingresso = await emitirIngresso(pessoa.ator, { jogo: JOGO });
  const aberta = await trocarIngresso({ ingresso: ingresso.ingresso });
  const sessao = await sessaoDeJogoDoToken(aberta.token);
  const { emissor } = await chavesDoRecreio();
  const agora = new Date();
  const inicio = opcoes.expiraDuranteAuditoria ? new Date(agora.getTime() - 60_000) : agora;
  const fim = opcoes.expiraDuranteAuditoria
    ? new Date(Math.floor(agora.getTime() / 1000) * 1000 - 26_000)
    : opcoes.curta
      ? new Date(Math.floor(agora.getTime() / 1000) * 1000 + 2_000)
      : new Date(aberta.expiraEm);
  if (opcoes.curta || opcoes.expiraDuranteAuditoria) {
    const normal = await emissor.sessao({
      ...sessao,
      agora: inicio,
      validoAte: fim,
      jti: randomUUID(),
    });
    aberta.token = normal.token;
    await db
      .update(games)
      .set({ expiresAt: fim, lastRenewedAt: inicio })
      .where(eq(games.id, sessao.sid));
  }
  const id = randomUUID();
  const capacidade = await emissor.salvamento({
    ...sessao,
    reciboId: id,
    agora: inicio,
    fimDaConcessao: fim,
  });
  await db.insert(permits).values({
    id,
    sessionId: sessao.sid,
    profileId: sessao.perfilId,
    policyVersion: sessao.versaoDaPolitica,
    mode: "profile",
    createdAt: inicio,
    renewedAt: inicio,
    cutoffAt: fim,
    expiresAt: capacidade.expiraEm,
  });
  return { pessoa, sessao, aberta, id, capacidade, fim };
}
const salvar = (r: Awaited<ReturnType<typeof preparar>>, dados = [gravacao]) =>
  pedir("POST", "/api/sdk/v1/sessao/salvamento", { token: r.capacidade.token, corpo: { dados } });

describe("persistência final com capacidade restrita", () => {
  it("depois da concessão recusa gameplay; salva uma vez, encerra e recupera só o mesmo corpo", async () => {
    const r = await preparar({ curta: true });
    // Relógio real; a fixture só encurta a concessão assinada daquele SID descartável.
    await new Promise((resolve) =>
      setTimeout(resolve, Math.max(0, r.fim.getTime() - Date.now()) + 50),
    );
    expect(
      (await pedir("POST", "/api/sdk/v1/dados", { token: r.aberta.token, corpo: gravacao })).status,
    ).toBe(401);
    const primeira = await salvar(r);
    expect(primeira).toMatchObject({
      status: 200,
      corpo: { estado: "completed", resultados: [{ chave: "pontos", revisao: 1 }] },
    });
    expect(await salvar(r)).toEqual(primeira);
    expect((await salvar(r, [{ ...gravacao, conteudo: "Mg==" }])).status).toBe(409);
    const [recibo] = await db.select().from(permits).where(eq(permits.id, r.id));
    const [jogo] = await db.select().from(games).where(eq(games.id, r.sessao.sid));
    expect(recibo).toMatchObject({ status: "completed", reason: "time" });
    expect(jogo).toMatchObject({
      endReason: "expired",
      endedAt: expect.any(Date),
      endedSeq: expect.any(Number),
    });
    expect(
      await db.select().from(versions).where(eq(versions.profileId, r.pessoa.perfil.id)),
    ).toHaveLength(1);
    expect((await eventosCom("savePermitId", r.id)).map((evento) => evento.eventType)).toEqual([
      "recreio.session_save_completed",
    ]);
    expect(
      (await pedir("POST", "/api/sdk/v1/sessao/renovar", { token: r.capacidade.token })).status,
    ).toBe(401);
    expect(
      (await pedir("POST", "/api/sdk/v1/dados", { token: r.capacidade.token, corpo: gravacao }))
        .status,
    ).toBe(401);
  });
  it("conflito conserva as duas versões e fecha sem escolher silenciosamente", async () => {
    const r = await preparar();
    await alterarDados(r.sessao, { ...gravacao, conteudo: "Nw==" });
    const resultado = await salvar(r);
    expect(resultado).toMatchObject({
      status: 200,
      corpo: {
        estado: "conflicted",
        resultados: [{ chave: "pontos", revisao: 1, conflitoId: expect.any(String) }],
      },
    });
    expect(await salvar(r)).toEqual(resultado);
    const linhas = await db
      .select()
      .from(versions)
      .where(eq(versions.profileId, r.pessoa.perfil.id));
    expect(linhas.map((linha) => [linha.kind, Buffer.from(linha.bytes).toString()]).sort()).toEqual(
      [
        ["accepted", "7"],
        ["conflict", "1"],
      ],
    );
  });
  it.each(["aparelho", "politica", "sucessor", "barreira"] as const)(
    "a margem não contorna %s",
    async (tipo) => {
      const r = await preparar();
      if (tipo === "aparelho")
        await db
          .update(devices)
          .set({ revokedAt: new Date(), revokeReasonCode: "manual" })
          .where(eq(devices.id, r.pessoa.ator.sessaoDeAparelhoId));
      else if (tipo === "politica")
        await db
          .update(profiles)
          .set({ policyVersion: r.sessao.versaoDaPolitica + 1 })
          .where(eq(profiles.id, r.pessoa.perfil.id));
      else if (tipo === "barreira")
        await db
          .update(games)
          .set({ checkpointFrozenAt: new Date() })
          .where(eq(games.id, r.sessao.sid));
      else {
        // Um sucessor que já terminou também invalida capacidade pendente do anterior.
        await db.execute(
          sql`update recreio.game_sessions set ended_at=clock_timestamp(),end_reason='expired',ended_seq=nextval('recreio.game_session_end_seq') where id=${r.sessao.sid}::uuid`,
        );
        const ingresso = await emitirIngresso(r.pessoa.ator, { jogo: JOGO });
        const seguinte = await trocarIngresso({ ingresso: ingresso.ingresso });
        const novo = await sessaoDeJogoDoToken(seguinte.token);
        await db.execute(
          sql`update recreio.game_sessions set ended_at=clock_timestamp(),end_reason='left',ended_seq=nextval('recreio.game_session_end_seq') where id=${novo.sid}::uuid`,
        );
      }
      expect((await salvar(r)).status).toBe(401);
      expect(
        await db.select().from(versions).where(eq(versions.profileId, r.pessoa.perfil.id)),
      ).toHaveLength(0);
      expect((await db.select().from(permits).where(eq(permits.id, r.id)))[0]?.status).toBe(
        "ready",
      );
    },
  );
  it("token normal e recibo de outro SID são recusados antes de persistir", async () => {
    const r = await preparar();
    expect(
      (
        await pedir("POST", "/api/sdk/v1/sessao/salvamento", {
          token: r.aberta.token,
          corpo: { dados: [gravacao] },
        })
      ).status,
    ).toBe(401);
    const outra = await preparar();
    const { emissor } = await chavesDoRecreio();
    const incorreta = await emissor.salvamento({
      ...outra.sessao,
      reciboId: r.id,
      agora: new Date(),
      fimDaConcessao: new Date(outra.aberta.expiraEm),
    });
    expect((await salvar({ ...outra, capacidade: incorreta })).status).toBe(401);
    expect(
      await db
        .select()
        .from(versions)
        .where(and(eq(versions.profileId, outra.sessao.perfilId), eq(versions.gameId, JOGO))),
    ).toHaveLength(0);
  });
  it("falha de auditoria reverte dados, recibo e encerramento", async () => {
    const r = await preparar();
    await db.execute(
      sql`create function audit.recusar_salvamento_em_teste() returns trigger language plpgsql as $$ begin if new.event_type='recreio.session_save_completed' then raise exception 'audit unavailable'; end if; return new; end $$`,
    );
    await db.execute(
      sql`create trigger recusar_salvamento_em_teste before insert on audit.events for each row execute function audit.recusar_salvamento_em_teste()`,
    );
    try {
      expect((await salvar(r)).status).toBe(503);
      expect(
        await db.select().from(versions).where(eq(versions.profileId, r.pessoa.perfil.id)),
      ).toHaveLength(0);
      expect(
        (await db.select().from(games).where(eq(games.id, r.sessao.sid)))[0]?.endedAt,
      ).toBeNull();
      expect((await db.select().from(permits).where(eq(permits.id, r.id)))[0]?.status).toBe(
        "ready",
      );
    } finally {
      await db.execute(sql`drop trigger recusar_salvamento_em_teste on audit.events`);
      await db.execute(sql`drop function audit.recusar_salvamento_em_teste()`);
    }
    expect((await salvar(r)).status).toBe(200);
  });
  it("uma espera na auditoria não confirma dados depois da margem", async () => {
    const r = await preparar({ expiraDuranteAuditoria: true });
    await db.execute(sql`create sequence audit.espera_salvamento_entrou`);
    await db.execute(
      sql`create function audit.esperar_salvamento_em_teste() returns trigger language plpgsql as $$ declare limite timestamptz; begin if new.event_type='recreio.session_save_completed' then perform nextval('audit.espera_salvamento_entrou'); select expires_at into limite from recreio.session_save_permits where id=(new.payload->>'savePermitId')::uuid; perform pg_sleep(greatest(0,extract(epoch from (limite-clock_timestamp())))+0.01); end if; return new; end $$`,
    );
    await db.execute(
      sql`create trigger esperar_salvamento_em_teste before insert on audit.events for each row execute function audit.esperar_salvamento_em_teste()`,
    );
    try {
      expect((await salvar(r)).status).toBe(401);
      // Sequence não é revertida: prova que a recusa veio depois da espera real.
      expect(
        (
          await db.execute<{ is_called: boolean }>(
            sql`select is_called from audit.espera_salvamento_entrou`,
          )
        )[0]?.is_called,
      ).toBe(true);
      expect(
        await db.select().from(versions).where(eq(versions.profileId, r.pessoa.perfil.id)),
      ).toHaveLength(0);
      expect((await db.select().from(permits).where(eq(permits.id, r.id)))[0]?.status).toBe(
        "ready",
      );
    } finally {
      await db.execute(sql`drop trigger esperar_salvamento_em_teste on audit.events`);
      await db.execute(sql`drop function audit.esperar_salvamento_em_teste()`);
      await db.execute(sql`drop sequence audit.espera_salvamento_entrou`);
    }
  });
});
