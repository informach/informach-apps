import { AuditPersistenceError } from "@informach/auth";
import { and, db, eq, sql } from "@informach/db";
import {
  recreioDeviceSessions as devices,
  recreioGameSessions as games,
  recreioSessionHandoffs as handoffs,
  recreioProfiles as profiles,
  sessions,
  recreioSpaces as spaces,
  recreioGameTickets as tickets,
  recreioMinorDailyUsage as usage,
} from "@informach/db/schema";
import { VERSAO_DA_RESPONSABILIDADE } from "@informach/recreio";
import { ControleDaSessaoSchema, SessaoAbertaSchema } from "@informach/recreio/contrato";
import { describe, expect, it, vi } from "vitest";
import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import { conferirAberturaDoJogo } from "@/features/autoridade-de-jogo/pagina-repository";
import { alterarDados } from "@/features/dados-de-perfil/service";
import { cadastrarPerfilMenor, prepararPerfilMenor } from "@/features/familia/service";
import { criarConvite, criarMundo, listarMundos } from "@/features/mundos/service";
import { consultarSupervisao, salvarSupervisao } from "@/features/politicas/service";
import { abrirMundo } from "@/features/posse/service";
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
import { aposentarInstancias, eventosCom, loginReal, novaConta, novoJogador, sinal } from "./apoio";
import { abrirPelaRota, cabecalhosDoHost, claimsDe, novaInstancia } from "./jogo-apoio";
import { pedir } from "./rotas";

vi.mock("@informach/config/jogos", async (original) => {
  const real = await original<typeof import("@informach/config/jogos")>();
  const jogos = [
    ...real.JOGOS,
    {
      ...real.JOGOS[0],
      id: "jogo-de-teste",
      nome: "Mundo protegido",
      rota: "/jogar/jogo-de-teste",
      classificacao: { faixa: "L", descritores: [], interacoes: [] },
      politicasDeMundo: [
        { id: "leve", faixaMinima: "L", padrao: true },
        { id: "adulto", faixaMinima: "18" },
      ],
    },
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
async function protegido(compartilhado = false, reconhecer = true, idade = 8) {
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
    nascimento: { ano: new Date().getUTCFullYear() - idade, mes: 1 },
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
  it("controle infantil projeta saldo sem gastar de novo, renovar ou revelar a conta", async () => {
    const r = await protegido();
    const supervisao = await consultarSupervisao(r.autor, r.perfil.id);
    await salvarSupervisao(r.autor, {
      perfilId: r.perfil.id,
      versao: supervisao.versao,
      configuracao: { ...supervisao.configuracao, minutosPorDia: 1 },
      reconheco: true,
    });
    const aberta = await abrir(r);
    const sessao = await sessaoDeJogoDoToken(aberta.token);
    const antes = await db.select().from(usage).where(eq(usage.profileId, r.perfil.id));
    const primeiro = await pedir("GET", "/api/sdk/v1/sessao/controle", { token: aberta.token });
    expect(primeiro.status).toBe(200);
    const controle = ControleDaSessaoSchema.parse(primeiro.corpo);
    expect(controle).toMatchObject({
      pausada: false,
      checkpoint: null,
      tempo: { limiteDiarioMinutos: 1, motivo: "daily_limit" },
    });
    expect(controle.tempo?.saldoMs).toBeGreaterThan(0);
    expect(controle.tempo?.saldoMs).toBeLessThanOrEqual(60_000);
    expect(controle.tempo?.pausaEm).not.toBeNull();
    expect(controle.expiraEm).toBe(aberta.expiraEm);
    const texto = JSON.stringify(controle);
    for (const privado of [r.conta.id, r.conta.email, r.perfil.id, "nascimento", "horarios"])
      expect(texto).not.toContain(privado);
    expect(
      (await pedir("GET", "/api/sdk/v1/sessao/controle", { token: aberta.token })).status,
    ).toBe(200);
    expect(await db.select().from(usage).where(eq(usage.profileId, r.perfil.id))).toEqual(antes);
    expect((await db.select().from(games).where(eq(games.id, sessao.sid)))[0]).toMatchObject({
      expiresAt: new Date(aberta.expiraEm),
      controlSeenAt: expect.any(Date),
    });
    await db
      .update(devices)
      .set({ expiresAt: sql`clock_timestamp()-interval '1 second'` })
      .where(eq(devices.id, r.ator.sessaoDeAparelhoId));
    expect(
      (await pedir("GET", "/api/sdk/v1/sessao/controle", { token: aberta.token })).status,
    ).toBe(401);
  });

  it("controle mostra a intenção vigente mesmo com tentativa anterior falha e permite ler a própria pausa", async () => {
    const r = await protegido();
    const aberta = await abrir(r);
    const sessao = await sessaoDeJogoDoToken(aberta.token);
    const fazer = async (falha: boolean) => {
      const ingresso = await emitirIngresso(r.ator, { jogo: JOGO });
      const agora = new Date();
      const [pedido] = await db
        .insert(handoffs)
        .values({
          profileId: r.perfil.id,
          fromSessionId: sessao.sid,
          toDeviceSessionId: r.ator.sessaoDeAparelhoId,
          ticketJti: String(claimsDe(ingresso.ingresso).jti),
          policyVersion: sessao.versaoDaPolitica,
          mode: "profile",
          status: falha ? "failed" : "requested",
          requestedAt: new Date(agora.getTime() - 1000),
          expiresAt: new Date(agora.getTime() + 20_000),
          finishedAt: falha ? agora : null,
        })
        .returning({ id: handoffs.id });
      if (!pedido) throw new Error("Intenção ausente");
      return pedido;
    };
    await fazer(true);
    const atual = await fazer(false);
    const resposta = await pedir("GET", "/api/sdk/v1/sessao/controle", { token: aberta.token });
    expect(ControleDaSessaoSchema.parse(resposta.corpo)).toMatchObject({
      pausada: false,
      checkpoint: { id: atual.id, estado: "requested", modo: "profile" },
    });
    await db.transaction(async (tx) => {
      await tx
        .update(handoffs)
        .set({ status: "confirmed", confirmedAt: new Date() })
        .where(eq(handoffs.id, atual.id));
      await tx
        .update(games)
        .set({ checkpointFrozenAt: new Date() })
        .where(eq(games.id, sessao.sid));
    });
    const pausada = await pedir("GET", "/api/sdk/v1/sessao/controle", { token: aberta.token });
    expect(ControleDaSessaoSchema.parse(pausada.corpo)).toMatchObject({
      pausada: true,
      checkpoint: { id: atual.id, estado: "confirmed" },
    });
    await expect(
      alterarDados(sessao, { operacao: "gravar", chave: "pontos", conteudo: "MQ==", revisao: 0 }),
    ).rejects.toMatchObject({ codigo: "SESSAO_ENCERRADA" });
  });
  it("barreira de checkpoint recusa progresso, renovação e substituição sem consumir outro ingresso", async () => {
    const r = await protegido();
    const aberta = await abrir(r);
    const sessao = await sessaoDeJogoDoToken(aberta.token);
    await db
      .update(games)
      .set({ checkpointFrozenAt: sql`clock_timestamp()` })
      .where(eq(games.id, sessao.sid));
    await expect(
      alterarDados(sessao, { operacao: "gravar", chave: "pontos", conteudo: "MQ==", revisao: 0 }),
    ).rejects.toMatchObject({ codigo: "SESSAO_ENCERRADA", detalhe: { motivo: "checkpoint" } });
    await expect(renovarSessao(aberta.token)).rejects.toMatchObject({
      codigo: "SESSAO_ENCERRADA",
      detalhe: { motivo: "checkpoint" },
    });
    const ingresso = await emitirIngresso(r.ator, { jogo: JOGO });
    await expect(
      trocarIngresso({ ingresso: ingresso.ingresso, continuarAqui: true }),
    ).rejects.toMatchObject({ codigo: "CHECKPOINT_PENDENTE" });
    expect(
      (
        await db
          .select()
          .from(tickets)
          .where(eq(tickets.jti, String(claimsDe(ingresso.ingresso).jti)))
      )[0]?.consumedAt,
    ).toBeNull();
    expect((await db.select().from(games).where(eq(games.id, sessao.sid)))[0]).toMatchObject({
      checkpointFrozenAt: expect.any(Date),
      endedAt: null,
      expiresAt: new Date(aberta.expiraEm),
    });
  });
  it("mundo infantil usa faixa própria; conteúdo adulto não aparece nem atribui posse", async () => {
    const r = await protegido();
    const autor = {
      perfilId: r.perfil.id,
      sessaoDeAparelhoId: r.ator.sessaoDeAparelhoId,
      jogo: "jogo-de-teste",
    };
    await expect(
      criarMundo(autor, { nome: "Conteúdo adulto", politicaDeConteudo: "adulto" }),
    ).rejects.toMatchObject({ codigo: "POLITICA_INCOMPATIVEL" });
    const mundo = await criarMundo(autor, { nome: "Conteúdo leve" });
    const ticket = await emitirIngresso(r.ator, { jogo: autor.jogo });
    const aberta = await trocarIngresso({ ingresso: ticket.ingresso });
    const sessao = await sessaoDeJogoDoToken(aberta.token);
    expect(await listarMundos(sessao)).toMatchObject([{ id: mundo.id }]);
    await expect(criarConvite(sessao, mundo.id, { forma: "member" })).rejects.toMatchObject({
      codigo: "POLITICA_INCOMPATIVEL",
    });
    await db.update(spaces).set({ contentPolicy: "adulto" }).where(eq(spaces.id, mundo.id));
    expect(await listarMundos(sessao)).toEqual([]);
    await expect(abrirMundo(sessao, mundo.id)).rejects.toMatchObject({
      codigo: "POLITICA_INCOMPATIVEL",
    });
  });

  it("instância admite a política infantil atual e recusa aparelho vencido sem revelar o perfil", async () => {
    await aposentarInstancias();
    const r = await protegido(false, true, 15);
    const supervisao = await consultarSupervisao(r.autor, r.perfil.id);
    await salvarSupervisao(r.autor, {
      perfilId: r.perfil.id,
      versao: supervisao.versao,
      configuracao: { ...supervisao.configuracao, textoLivre: true },
      reconheco: true,
    });
    const jogo = "jogo-de-teste";
    const autor = { perfilId: r.perfil.id, sessaoDeAparelhoId: r.ator.sessaoDeAparelhoId, jogo };
    const mundo = await criarMundo(autor, { nome: "Mundo da instância" });
    const instancia = await novaInstancia(jogo);
    const ticket = await emitirIngresso(r.ator, { jogo });
    const aberta = SessaoAbertaSchema.parse(await trocarIngresso({ ingresso: ticket.ingresso }));
    expect(aberta.politica.textoLivre).toBe(false);
    const sessao = await sessaoDeJogoDoToken(aberta.token);
    expect((await abrirPelaRota({ token: aberta.token, sid: sessao.sid }, mundo.id)).status).toBe(
      200,
    );
    const posse = await instancia.cliente.reivindicarPosse(mundo.id);
    const entrar = () =>
      pedir("POST", `/api/interno/v1/mundos/${mundo.id}/entradas`, {
        headers: cabecalhosDoHost(jogo, instancia.instanciaId),
        corpo: { cerca: posse.cerca, sid: sessao.sid, perfilId: r.perfil.id },
      });
    const admitida = await entrar();
    expect(admitida).toMatchObject({
      status: 200,
      corpo: { apelido: "Protegido", politica: { multiplayer: true, textoLivre: false } },
    });
    expect(JSON.stringify(admitida.corpo)).not.toContain(r.conta.id);
    expect(JSON.stringify(admitida.corpo)).not.toContain(r.conta.email);
    await db
      .update(devices)
      .set({ expiresAt: sql`clock_timestamp()-interval '1 second'` })
      .where(eq(devices.id, autor.sessaoDeAparelhoId));
    expect(await entrar()).toEqual({ status: 403, corpo: { codigo: "SESSAO_ENCERRADA" } });
  });
  it("prévia da estante usa a autoridade atual sem iniciar sessão ou contabilizar tempo", async () => {
    const r = await protegido();
    const referencia = { perfilId: r.perfil.id, sessaoDeAparelhoId: r.ator.sessaoDeAparelhoId };
    expect(await conferirAberturaDoJogo(referencia, JOGO)).toBe(true);
    expect(await conferirAberturaDoJogo(referencia, "morada")).toBe(false);
    expect(await db.select().from(games).where(eq(games.profileId, r.perfil.id))).toEqual([]);
    expect(await db.select().from(usage).where(eq(usage.profileId, r.perfil.id))).toEqual([]);
    const outro = await novoJogador();
    await expect(
      conferirAberturaDoJogo(
        { ...referencia, sessaoDeAparelhoId: outro.ator.sessaoDeAparelhoId },
        JOGO,
      ),
    ).rejects.toMatchObject({ codigo: "SESSAO_INVALIDA" });
    await desconectarTodosDoMenor(r.autor, r.perfil.id);
    await expect(conferirAberturaDoJogo(referencia, JOGO)).rejects.toMatchObject({
      codigo: "SESSAO_INVALIDA",
    });
  });
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
