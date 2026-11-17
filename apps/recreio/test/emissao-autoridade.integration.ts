import { AuditPersistenceError } from "@informach/auth";
import { and, db, eq, sql } from "@informach/db";
import {
  recreioDeviceSessions as devices,
  recreioGameSessions as games,
  recreioProfiles as profiles,
  sessions,
  recreioGameTickets as tickets,
  recreioMinorDailyUsage as usage,
} from "@informach/db/schema";
import { VERSAO_DA_RESPONSABILIDADE } from "@informach/recreio";
import { SessaoAbertaSchema } from "@informach/recreio/contrato";
import { describe, expect, it, vi } from "vitest";
import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import { alterarDados } from "@/features/dados-de-perfil/service";
import { cadastrarPerfilMenor, prepararPerfilMenor } from "@/features/familia/service";
import { consultarSupervisao, salvarSupervisao } from "@/features/politicas/service";
import {
  aprovarPareamento,
  consultarPareamento,
  definirPinDaConta,
  definirPinDoMenor,
  desconectarTodosDoMenor,
  prepararPareamento,
  trocarPerfilComPin,
} from "@/features/protecao/service";
import { resolverAtor } from "@/features/sessao/service";
import {
  emitirIngresso,
  renovarSessao,
  sairDaSessao,
  sessaoDeJogoDoToken,
  trocarIngresso,
} from "@/features/sessao-de-jogo/service";
import { chavesDoRecreio } from "@/lib/tokens";
import { conceder } from "../scripts/concessoes";
import { eventosCom, loginReal, novaConta, novoJogador, sinal } from "./apoio";
import { claimsDe } from "./jogo-apoio";

vi.mock("@informach/config/jogos", async (original) => {
  const real = await original<typeof import("@informach/config/jogos")>();
  const jogos = [
    ...real.JOGOS,
    {
      ...real.JOGOS[0],
      id: "emissao-menor",
      nome: "Emissão protegida",
      rota: "/jogar/emissao-menor",
      capacidades: { ...real.JOGOS[0].capacidades, mundos: null, posse: [], dadosDePerfil: true },
      classificacao: { faixa: "L", descritores: [], interacoes: [] },
    },
  ];
  return {
    ...real,
    JOGOS: jogos,
    jogoPorId: (id: string) => jogos.find((j) => j.id === id) ?? null,
  };
});
const JOGO = "emissao-menor";
let ip = 1;
async function protegido(compartilhado = false, reconhecer = true) {
  const conta = await novaConta();
  const login = await loginReal(conta);
  const contexto = await resolverAtor(login);
  const [sessao] = await db.select().from(sessions).where(eq(sessions.id, login.authSessionId));
  if (!contexto || !sessao) throw new Error("Login ausente");
  const autor: AutorNativoRecente = {
    ...contexto.ator,
    login: { authSessionId: sessao.id, criadoEm: sessao.createdAt, expiraEm: sessao.expiresAt },
  };
  const intencao = await prepararPerfilMenor(autor);
  const { perfil } = await cadastrarPerfilMenor(autor, {
    intencaoId: intencao.id,
    perfil: { apelido: "Protegido", avatar: "padrao" },
    nascimento: { ano: new Date().getUTCFullYear() - 8, mes: 1 },
    assumoResponsabilidade: true,
    versaoDaDeclaracao: VERSAO_DA_RESPONSABILIDADE,
  });
  await conceder({ email: conta.email, tier: "family", dias: 30, motivo: "teste" });
  const supervisao = await consultarSupervisao(autor, perfil.id);
  if (reconhecer)
    await salvarSupervisao(autor, {
      perfilId: perfil.id,
      versao: supervisao.versao,
      configuracao: supervisao.configuracao,
      reconheco: true,
    });
  let aparelhoId = autor.sessaoDeAparelhoId;
  if (compartilhado) {
    await definirPinDaConta(autor, { pin: "593871" });
    await definirPinDoMenor(autor, { perfilId: perfil.id, pin: "396175" });
    await trocarPerfilComPin(autor, {
      destino: { tipo: "perfil", perfilId: perfil.id },
      pin: "396175",
    });
  } else {
    const pedido = await prepararPareamento(`203.0.113.${ip++}`);
    const pareado = await aprovarPareamento(autor, { perfilId: perfil.id, codigo: pedido.codigo });
    await consultarPareamento(pedido.segredo);
    aparelhoId = pareado.aparelhoId;
  }
  return { conta, autor, perfil, supervisao, ator: { perfil, sessaoDeAparelhoId: aparelhoId } };
}
async function abrir(r: Awaited<ReturnType<typeof protegido>>) {
  const ingresso = await emitirIngresso(r.ator, { jogo: JOGO });
  return SessaoAbertaSchema.parse(await trocarIngresso({ ingresso: ingresso.ingresso }));
}

describe("emissão transacional da autoridade", () => {
  it("revogação global encerra o contexto nativo infantil; PIN antigo não o readmite", async () => {
    const r = await protegido(true);
    const login = await loginReal(r.conta);
    const contexto = await resolverAtor(login);
    const [sessao] = await db.select().from(sessions).where(eq(sessions.id, login.authSessionId));
    if (!contexto || !sessao) throw new Error("Login do adulto ausente");
    const responsavel: AutorNativoRecente = {
      ...contexto.ator,
      login: { authSessionId: sessao.id, criadoEm: sessao.createdAt, expiraEm: sessao.expiresAt },
    };
    await emitirIngresso(r.ator, { jogo: JOGO });
    await desconectarTodosDoMenor(responsavel, r.perfil.id);
    expect(
      (await db.select().from(devices).where(eq(devices.id, r.ator.sessaoDeAparelhoId)))[0]
        ?.revokedAt,
    ).toBeInstanceOf(Date);
    await expect(
      trocarPerfilComPin(r.autor, {
        destino: { tipo: "perfil", perfilId: r.perfil.id },
        pin: "396175",
      }),
    ).rejects.toMatchObject({ code: "AUTH" });
    expect((await consultarSupervisao(responsavel, r.perfil.id)).perfilId).toBe(r.perfil.id);
    expect(await db.select().from(tickets).where(eq(tickets.profileId, r.perfil.id))).toEqual([]);
  });
  it("revogar acesso protegido invalida também ingressos ainda não usados", async () => {
    const r = await protegido();
    await emitirIngresso(r.ator, { jogo: JOGO });
    await desconectarTodosDoMenor(r.autor, r.perfil.id);
    expect(await db.select().from(tickets).where(eq(tickets.profileId, r.perfil.id))).toEqual([]);
  });
  it("falha da auditoria de revogação conserva o ingresso e sua autoridade original", async () => {
    const r = await protegido();
    const ingresso = await emitirIngresso(r.ator, { jogo: JOGO });
    await db.execute(
      sql`create function audit.recusar_revogacao_de_ingresso() returns trigger language plpgsql as $$ begin if new.event_type='recreio.minor_access_revoked' then raise exception 'auditoria indisponível'; end if; return new; end $$`,
    );
    await db.execute(
      sql`create trigger recusar_revogacao_de_ingresso before insert on audit.events for each row execute function audit.recusar_revogacao_de_ingresso()`,
    );
    try {
      await expect(desconectarTodosDoMenor(r.autor, r.perfil.id)).rejects.toBeInstanceOf(
        AuditPersistenceError,
      );
    } finally {
      await db.execute(sql`drop trigger recusar_revogacao_de_ingresso on audit.events`);
      await db.execute(sql`drop function audit.recusar_revogacao_de_ingresso()`);
    }
    expect(
      (await db.select().from(tickets).where(eq(tickets.profileId, r.perfil.id)))[0]?.consumedAt,
    ).toBeNull();
    expect(await trocarIngresso({ ingresso: ingresso.ingresso })).toMatchObject({
      perfil: { profileId: r.perfil.id },
    });
  });
  it.each([false, true])(
    "ingresso real inicia e renova concessão infantil sem identidade adulta; compartilhado=%s",
    async (compartilhado) => {
      const r = await protegido(compartilhado);
      const aberta = await abrir(r);
      expect(aberta.politica).toEqual({
        multiplayer: true,
        textoLivre: false,
        faixa: "6",
        versao: 1,
      });
      const sessao = await sessaoDeJogoDoToken(aberta.token);
      const claims = claimsDe(aberta.token);
      expect(Number(claims.exp) - Number(claims.iat)).toBeLessThanOrEqual(60);
      expect(Number(claims.exp) - Number(claims.iat)).toBeGreaterThan(0);
      expect(
        (await db.select().from(usage).where(eq(usage.profileId, r.perfil.id)))[0],
      ).toMatchObject({ sessionId: sessao.sid, leaseUntil: new Date(aberta.expiraEm) });
      await alterarDados(sessao, {
        operacao: "gravar",
        chave: "progresso",
        revisao: 0,
        conteudo: "YQ==",
      });
      const renovada = await renovarSessao(aberta.token);
      expect(renovada.token).not.toBe(aberta.token);
      expect(claimsDe(renovada.token)).toMatchObject({ sid: sessao.sid, pv: 1 });
      expect(
        (
          await db.select().from(usage).where(eq(usage.profileId, r.perfil.id))
        )[0]?.leaseUntil?.toISOString(),
      ).toBe(renovada.expiraEm);
      await sairDaSessao(renovada.token);
      const eventos = (await eventosCom("sessionId", sessao.sid)).filter((e) =>
        ["recreio.game_session_started", "recreio.game_session_ended"].includes(e.eventType),
      );
      expect(eventos).toHaveLength(2);
      expect(eventos.every((e) => e.actorId === null && e.payload.targetId === null)).toBe(true);
    },
  );
  it("menor sem reconhecimento e Morada em análise não recebem ingresso", async () => {
    const pendente = await protegido(false, false);
    await expect(emitirIngresso(pendente.ator, { jogo: JOGO })).rejects.toMatchObject({
      codigo: "POLITICA_INCOMPATIVEL",
    });
    const r = await protegido();
    await expect(emitirIngresso(r.ator, { jogo: "morada" })).rejects.toMatchObject({
      codigo: "POLITICA_INCOMPATIVEL",
    });
    expect(await db.select().from(tickets).where(eq(tickets.profileId, r.perfil.id))).toEqual([]);
  });
  it("falha do assinador reverte consumo e tempo; o mesmo ingresso permite tentar de novo", async () => {
    const r = await protegido();
    const ingresso = await emitirIngresso(r.ator, { jogo: JOGO });
    const { emissor } = await chavesDoRecreio();
    const falha = vi
      .spyOn(emissor, "sessao")
      .mockRejectedValueOnce(new Error("assinatura indisponível"));
    try {
      await expect(trocarIngresso({ ingresso: ingresso.ingresso })).rejects.toThrow(
        "assinatura indisponível",
      );
    } finally {
      falha.mockRestore();
    }
    expect(
      (await db.select().from(tickets).where(eq(tickets.profileId, r.perfil.id)))[0]?.consumedAt,
    ).toBeNull();
    expect(await db.select().from(games).where(eq(games.profileId, r.perfil.id))).toEqual([]);
    expect(await db.select().from(usage).where(eq(usage.profileId, r.perfil.id))).toEqual([]);
    expect(await trocarIngresso({ ingresso: ingresso.ingresso })).toMatchObject({
      perfil: { profileId: r.perfil.id },
    });
  });
  it("a versão assinada é a relida depois da espera de perfil, sem token antigo com linha nova", async () => {
    const r = await novoJogador();
    const pronto = sinal<number>();
    const liberar = sinal<void>();
    const trava = db.transaction(async (tx) => {
      await tx.update(profiles).set({ policyVersion: 2 }).where(eq(profiles.id, r.perfil.id));
      const [conexao] = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
      if (!conexao) throw new Error("Conexão ausente");
      pronto.concluir(conexao.pid);
      await liberar.promessa;
    });
    void trava.catch(pronto.recusar);
    const pid = await pronto.promessa;
    const emissao = emitirIngresso(r.ator, { jogo: "morada" });
    try {
      await expect
        .poll(
          async () =>
            (
              await db.execute<{ esperando: boolean }>(
                sql`select exists(select 1 from pg_stat_activity where ${pid}=any(pg_blocking_pids(pid))) as esperando`,
              )
            )[0]?.esperando,
          { interval: 20 },
        )
        .toBe(true);
    } finally {
      liberar.concluir(undefined);
      await trava;
    }
    expect(claimsDe((await emissao).ingresso)).toMatchObject({ pv: 2 });
  });
  it("nonce que vence durante a espera não é consumido e não inicia partida", async () => {
    const r = await novoJogador();
    const ingresso = await emitirIngresso(r.ator, { jogo: "morada" });
    const jti = String(claimsDe(ingresso.ingresso).jti);
    const pronto = sinal<number>();
    const liberar = sinal<void>();
    const trava = db.transaction(async (tx) => {
      await tx
        .update(tickets)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(tickets.jti, jti));
      const [conexao] = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
      if (!conexao) throw new Error("Conexão ausente");
      pronto.concluir(conexao.pid);
      await liberar.promessa;
    });
    void trava.catch(pronto.recusar);
    const pid = await pronto.promessa;
    const resultado = trocarIngresso({ ingresso: ingresso.ingresso }).then(
      (valor) => ({ ok: true, valor }),
      (erro: unknown) => ({ ok: false, erro }),
    );
    try {
      await expect
        .poll(
          async () =>
            (
              await db.execute<{ esperando: boolean }>(
                sql`select exists(select 1 from pg_stat_activity where ${pid}=any(pg_blocking_pids(pid))) as esperando`,
              )
            )[0]?.esperando,
          { interval: 20 },
        )
        .toBe(true);
    } finally {
      liberar.concluir(undefined);
      await trava;
    }
    expect(await resultado).toMatchObject({ ok: false, erro: { codigo: "INGRESSO_INVALIDO" } });
    expect((await db.select().from(tickets).where(eq(tickets.jti, jti)))[0]?.consumedAt).toBeNull();
    expect(await db.select().from(games).where(eq(games.profileId, r.perfil.id))).toEqual([]);
  });
  it("login retirado enquanto a renovação espera a partida não recebe token novo", async () => {
    const r = await novoJogador();
    const ingresso = await emitirIngresso(r.ator, { jogo: "morada" });
    const aberta = await trocarIngresso({ ingresso: ingresso.ingresso });
    const sessao = await sessaoDeJogoDoToken(aberta.token);
    const pronto = sinal<number>();
    const liberar = sinal<void>();
    const trava = db.transaction(async (tx) => {
      await tx.select().from(games).where(eq(games.id, sessao.sid)).for("update");
      const [conexao] = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
      if (!conexao) throw new Error("Conexão ausente");
      pronto.concluir(conexao.pid);
      await liberar.promessa;
    });
    void trava.catch(pronto.recusar);
    const pid = await pronto.promessa;
    const resultado = renovarSessao(aberta.token).then(
      (valor) => ({ ok: true, valor }),
      (erro: unknown) => ({ ok: false, erro }),
    );
    try {
      await expect
        .poll(
          async () =>
            (
              await db.execute<{ esperando: boolean }>(
                sql`select exists(select 1 from pg_stat_activity where ${pid}=any(pg_blocking_pids(pid))) as esperando`,
              )
            )[0]?.esperando,
          { interval: 20 },
        )
        .toBe(true);
      await db.delete(sessions).where(eq(sessions.id, r.login.authSessionId));
    } finally {
      liberar.concluir(undefined);
      await trava;
    }
    expect(await resultado).toMatchObject({
      ok: false,
      erro: { codigo: "ACESSO_PERDIDO", detalhe: { motivo: "signed_out" } },
    });
    expect((await db.select().from(games).where(eq(games.id, sessao.sid)))[0]).toMatchObject({
      expiresAt: new Date(aberta.expiraEm),
      endReason: "signed_out",
    });
  });
  it("mudar supervisão depois da emissão não consome o ingresso da revisão anterior", async () => {
    const r = await protegido();
    const ingresso = await emitirIngresso(r.ator, { jogo: JOGO });
    await salvarSupervisao(r.autor, {
      perfilId: r.perfil.id,
      versao: r.supervisao.versao,
      configuracao: { ...r.supervisao.configuracao, pausado: true },
      reconheco: true,
    });
    await expect(trocarIngresso({ ingresso: ingresso.ingresso })).rejects.toMatchObject({
      codigo: "POLITICA_INCOMPATIVEL",
    });
    expect(
      (
        await db
          .select()
          .from(tickets)
          .where(
            and(
              eq(tickets.profileId, r.perfil.id),
              eq(tickets.jti, String(claimsDe(ingresso.ingresso).jti)),
            ),
          )
      )[0]?.consumedAt,
    ).toBeNull();
  });
});
