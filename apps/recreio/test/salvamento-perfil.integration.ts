import { randomBytes, randomUUID } from "node:crypto";
import { and, db, eq, sql } from "@informach/db";
import {
  recreioDeviceSessions as devices,
  recreioGameSessions as games,
  recreioSessionSavePermits as permits,
  recreioProfiles as profiles,
  recreioGameTickets as tickets,
  recreioProfileDataVersions as versions,
} from "@informach/db/schema";
import { SessaoRenovadaSchema } from "@informach/recreio/contrato";
import { verificarSalvamentoEmitido } from "@informach/recreio/emissor";
import { criarRecreio } from "@informach/recreio/sdk";
import { describe, expect, it, vi } from "vitest";
import { alterarDados } from "@/features/dados-de-perfil/service";
import { selecionarPerfil } from "@/features/perfis/service";
import { travarEncerramentos } from "@/features/sessao-de-jogo/encerramento-repository";
import {
  emitirIngresso,
  renovarSessao,
  sessaoDeJogoDoToken,
  trocarIngresso,
} from "@/features/sessao-de-jogo/service";
import { env } from "@/lib/env";
import { chavesDoRecreio } from "@/lib/tokens";
import { atorDaConta, eventosCom, novoJogador } from "./apoio";
import { despachar, ORIGEM, pedir } from "./rotas";

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
  it.each([false, true])(
    "renovação na fronteira conserva a distinção entre prazo e revogação (%s)",
    async (revogado) => {
      const r = await preparar({ curta: true });
      if (revogado)
        await db
          .update(devices)
          .set({ revokedAt: new Date() })
          .where(eq(devices.id, r.pessoa.ator.sessaoDeAparelhoId));
      await new Promise((resolve) =>
        setTimeout(resolve, Math.max(0, r.fim.getTime() - Date.now()) + 20),
      );
      const motivo = revogado ? "signed_out" : "expired";
      await expect(renovarSessao(r.aberta.token)).rejects.toMatchObject({
        codigo: "ACESSO_PERDIDO",
        detalhe: { motivo },
      });
      expect((await db.select().from(games).where(eq(games.id, r.sessao.sid)))[0]?.endReason).toBe(
        motivo,
      );
      expect((await salvar(r)).status).toBe(revogado ? 401 : 200);
    },
  );
  it("lote vazio reconhece conflitos já guardados sem sobrescrever ou duplicar as versões", async () => {
    const r = await preparar();
    await alterarDados(r.sessao, { ...gravacao, conteudo: "Nw==" });
    await expect(alterarDados(r.sessao, gravacao)).rejects.toMatchObject({
      codigo: "REVISAO_DIVERGENTE",
    });
    const antes = await db
      .select()
      .from(versions)
      .where(eq(versions.profileId, r.pessoa.perfil.id))
      .orderBy(versions.id);
    expect(await salvar(r, [])).toMatchObject({
      status: 200,
      corpo: { estado: "conflicted", resultados: [] },
    });
    expect(
      await db
        .select()
        .from(versions)
        .where(eq(versions.profileId, r.pessoa.perfil.id))
        .orderBy(versions.id),
    ).toEqual(antes);
  });
  it("desligar o escritor não apaga a margem já emitida", async () => {
    const r = await preparar();
    expect((await pedir("POST", "/api/sdk/v1/sessao/sair", { token: r.aberta.token })).status).toBe(
      200,
    );
    const ingresso = await emitirIngresso(r.pessoa.ator, { jogo: JOGO });
    const anterior = env.RECREIO_CHECKPOINT_MODE;
    env.RECREIO_CHECKPOINT_MODE = "off";
    try {
      await expect(trocarIngresso({ ingresso: ingresso.ingresso })).rejects.toMatchObject({
        codigo: "CHECKPOINT_PENDENTE",
        detalhe: { motivo: "saving" },
      });
    } finally {
      env.RECREIO_CHECKPOINT_MODE = anterior;
    }
    expect((await salvar(r)).status).toBe(200);
    expect((await trocarIngresso({ ingresso: ingresso.ingresso })).token).toBeTruthy();
  });
  it("revogação explícita do aparelho anterior não prende o perfil à sua margem", async () => {
    const r = await preparar();
    expect((await pedir("POST", "/api/sdk/v1/sessao/sair", { token: r.aberta.token })).status).toBe(
      200,
    );
    await db
      .update(devices)
      .set({ revokedAt: new Date() })
      .where(eq(devices.id, r.pessoa.ator.sessaoDeAparelhoId));
    const aparelho = await atorDaConta(r.pessoa.conta);
    await selecionarPerfil(aparelho, r.pessoa.perfil.id);
    const ingresso = await emitirIngresso({ ...aparelho, perfil: r.pessoa.perfil }, { jogo: JOGO });
    expect((await trocarIngresso({ ingresso: ingresso.ingresso })).token).toBeTruthy();
    expect((await salvar(r)).status).toBe(401);
  });
  it("salvamento e reconexão concorrentes preservam a versão que o novo SID vai ler", async () => {
    const r = await preparar();
    expect((await pedir("POST", "/api/sdk/v1/sessao/sair", { token: r.aberta.token })).status).toBe(
      200,
    );
    const ingresso = await emitirIngresso(r.pessoa.ator, { jogo: JOGO });
    const pedido = { ingresso: ingresso.ingresso };
    const [final, abertura] = await Promise.allSettled([salvar(r), trocarIngresso(pedido)]);
    expect(final).toMatchObject({ status: "fulfilled", value: { status: 200 } });
    if (abertura.status === "rejected")
      expect(abertura.reason).toMatchObject({
        codigo: "CHECKPOINT_PENDENTE",
        detalhe: { motivo: "saving" },
      });
    const seguinte =
      abertura.status === "fulfilled" ? abertura.value : await trocarIngresso(pedido);
    expect(
      await pedir("GET", "/api/sdk/v1/dados?chave=pontos", { token: seguinte.token }),
    ).toMatchObject({
      status: 200,
      corpo: { versao: { revisao: 1, conteudo: "MQ==" } },
    });
  });
  it("nova abertura aguarda a margem do antecessor sem consumir ingresso e lê o commit final", async () => {
    const r = await preparar({ curta: true });
    await new Promise((resolve) =>
      setTimeout(resolve, Math.max(0, r.fim.getTime() - Date.now()) + 20),
    );
    const ingresso = await emitirIngresso(r.pessoa.ator, { jogo: JOGO });
    const pedido = { ingresso: ingresso.ingresso, suportaSalvamento: true };
    const antes = await db.select().from(permits).where(eq(permits.id, r.id));
    await expect(trocarIngresso(pedido)).rejects.toMatchObject({
      codigo: "CHECKPOINT_PENDENTE",
      detalhe: { motivo: "saving" },
    });
    expect(await db.select().from(permits).where(eq(permits.id, r.id))).toEqual(antes);
    expect(
      (await db.select().from(games).where(eq(games.id, r.sessao.sid)))[0]?.endedAt,
    ).toBeNull();
    const [ticket] = await db
      .select()
      .from(tickets)
      .where(and(eq(tickets.profileId, r.pessoa.perfil.id), sql`${tickets.consumedAt} is null`));
    expect(ticket?.consumedAt).toBeNull();
    expect((await salvar(r)).status).toBe(200);
    const seguinte = await trocarIngresso(pedido);
    const leitura = await pedir("GET", "/api/sdk/v1/dados?chave=pontos", { token: seguinte.token });
    expect(leitura).toMatchObject({
      status: 200,
      corpo: { versao: { revisao: 1, conteudo: "MQ==" } },
    });
  });
  it.each([JOGO, "morada"])(
    "saída antecipada aguarda o recibo também ao trocar para %s",
    async (jogo) => {
      const r = await preparar();
      expect(
        (await pedir("POST", "/api/sdk/v1/sessao/sair", { token: r.aberta.token })).status,
      ).toBe(200);
      const ingresso = await emitirIngresso(r.pessoa.ator, { jogo });
      await expect(
        trocarIngresso({ ingresso: ingresso.ingresso, continuarAqui: true }),
      ).rejects.toMatchObject({
        codigo: "CHECKPOINT_PENDENTE",
        detalhe: { motivo: "saving" },
      });
      expect((await salvar(r)).status).toBe(200);
      expect((await trocarIngresso({ ingresso: ingresso.ingresso })).token).toBeTruthy();
    },
  );
  it("margem vencida libera nova abertura sem confirmar nem prorrogar o recibo antigo", async () => {
    const r = await preparar();
    const fim = new Date(Date.now() - 31_000);
    const inicio = new Date(fim.getTime() - 60_000);
    await db
      .update(games)
      .set({ lastRenewedAt: inicio, expiresAt: fim })
      .where(eq(games.id, r.sessao.sid));
    await db
      .update(permits)
      .set({
        createdAt: inicio,
        renewedAt: inicio,
        cutoffAt: fim,
        expiresAt: new Date(fim.getTime() + 30_000),
      })
      .where(eq(permits.id, r.id));
    const ingresso = await emitirIngresso(r.pessoa.ator, { jogo: JOGO });
    expect((await trocarIngresso({ ingresso: ingresso.ingresso })).token).toBeTruthy();
    expect((await db.select().from(permits).where(eq(permits.id, r.id)))[0]?.status).toBe("ready");
    expect((await salvar(r)).status).toBe(401);
  });
  it("SDK recupera a resposta final perdida depois do commit sem duplicar dados ou eventos", async () => {
    const pessoa = await novoJogador();
    let finais = 0;
    const contexto = await criarRecreio({
      baseUrl: ORIGEM,
      jogo: JOGO,
      salvamentoRestrito: true,
      obterIngresso: async () => (await emitirIngresso(pessoa.ator, { jogo: JOGO })).ingresso,
      fetch: async (url, init) => {
        const resposta = await despachar(url, init);
        if (url.endsWith("/sessao/salvamento") && init?.method === "POST") {
          finais++;
          if (finais === 1) {
            expect(resposta.status).toBe(200);
            await resposta.body?.cancel();
            throw new Error("Resposta perdida depois do commit real");
          }
        }
        return resposta;
      },
    });
    try {
      const saida = contexto.sessao.salvamento;
      if (!saida) throw new Error("Capacidade ausente");
      expect(
        await saida.finalizarDados([{ chave: "pontos", revisao: 0, dados: new Uint8Array([49]) }]),
      ).toMatchObject({ estado: "completed", resultados: [{ chave: "pontos", revisao: 1 }] });
      expect(finais).toBe(2);
      expect(await saida.estado()).toMatchObject({ estado: "completed" });
      expect(
        await db.select().from(versions).where(eq(versions.profileId, pessoa.perfil.id)),
      ).toHaveLength(1);
      const [recibo] = await db
        .select()
        .from(permits)
        .where(eq(permits.profileId, pessoa.perfil.id));
      if (!recibo) throw new Error("Recibo ausente");
      expect(
        (await eventosCom("savePermitId", recibo.id)).map((evento) => evento.eventType),
      ).toEqual(["recreio.session_save_prepared", "recreio.session_save_completed"]);
    } finally {
      await contexto.sessao.sair().catch(() => undefined);
    }
  });
  it("negocia na abertura, renova o mesmo recibo e recupera sem ampliar a concessão", async () => {
    const pessoa = await novoJogador();
    const ingresso = await emitirIngresso(pessoa.ator, { jogo: JOGO });
    const pedido = {
      ingresso: ingresso.ingresso,
      suportaSalvamento: true,
      chaveDeTroca: randomBytes(32).toString("base64url"),
    };
    const aberta = await trocarIngresso(pedido);
    if (!aberta.salvamento) throw new Error("Capacidade negociada ausente");
    const { emissor, chaves } = await chavesDoRecreio();
    const primeira = await verificarSalvamentoEmitido(aberta.salvamento.token, {
      emissor: emissor.emissor,
      chaves,
    });
    const sessao = await sessaoDeJogoDoToken(aberta.token);
    expect(primeira).toMatchObject({
      sid: sessao.sid,
      perfilId: pessoa.perfil.id,
      expiraEm: Date.parse(aberta.expiraEm) + 30_000,
    });
    const resposta = await pedir("POST", "/api/sdk/v1/sessao/renovar", { token: aberta.token });
    expect(resposta.status).toBe(200);
    const renovada = SessaoRenovadaSchema.parse(resposta.corpo);
    if (!renovada.salvamento) throw new Error("Capacidade renovada ausente");
    const seguinte = await verificarSalvamentoEmitido(renovada.salvamento.token, {
      emissor: emissor.emissor,
      chaves,
    });
    expect(seguinte.reciboId).toBe(primeira.reciboId);
    const antes = await db.select().from(permits).where(eq(permits.sessionId, sessao.sid));
    const recuperada = await trocarIngresso(pedido);
    if (!recuperada.salvamento) throw new Error("Recibo recuperado ausente");
    expect(
      (
        await verificarSalvamentoEmitido(recuperada.salvamento.token, {
          emissor: emissor.emissor,
          chaves,
        })
      ).reciboId,
    ).toBe(primeira.reciboId);
    expect(await db.select().from(permits).where(eq(permits.sessionId, sessao.sid))).toEqual(antes);
    expect(
      (await eventosCom("savePermitId", primeira.reciboId)).map((evento) => evento.eventType),
    ).toEqual(["recreio.session_save_prepared"]);
  });
  it("cliente anterior e título sem capacidade não recebem permissão nova ao renovar", async () => {
    for (const [jogo, negociar] of [
      [JOGO, false],
      ["morada", true],
    ] as const) {
      const pessoa = await novoJogador();
      const ingresso = await emitirIngresso(pessoa.ator, { jogo });
      const aberta = await trocarIngresso({
        ingresso: ingresso.ingresso,
        ...(negociar ? { suportaSalvamento: true } : {}),
      });
      expect(aberta.salvamento).toBeUndefined();
      const renovada = await pedir("POST", "/api/sdk/v1/sessao/renovar", { token: aberta.token });
      expect(renovada.status).toBe(200);
      expect(SessaoRenovadaSchema.parse(renovada.corpo).salvamento).toBeUndefined();
      expect(
        await db.select().from(permits).where(eq(permits.profileId, pessoa.perfil.id)),
      ).toHaveLength(0);
    }
  });
  it("a auditoria de emissão reverte ingresso, partida e capacidade juntos", async () => {
    const pessoa = await novoJogador();
    const ingresso = await emitirIngresso(pessoa.ator, { jogo: JOGO });
    await db.execute(
      sql`create function audit.recusar_permissao_salvamento_em_teste() returns trigger language plpgsql as $$ begin if new.event_type='recreio.session_save_prepared' then raise exception 'audit unavailable'; end if; return new; end $$`,
    );
    await db.execute(
      sql`create trigger recusar_permissao_salvamento_em_teste before insert on audit.events for each row execute function audit.recusar_permissao_salvamento_em_teste()`,
    );
    try {
      await expect(
        trocarIngresso({ ingresso: ingresso.ingresso, suportaSalvamento: true }),
      ).rejects.toMatchObject({ name: "AuditPersistenceError" });
      expect(
        await db.select().from(games).where(eq(games.profileId, pessoa.perfil.id)),
      ).toHaveLength(0);
      expect(
        await db.select().from(permits).where(eq(permits.profileId, pessoa.perfil.id)),
      ).toHaveLength(0);
      expect(
        (await db.select().from(tickets).where(eq(tickets.profileId, pessoa.perfil.id)))[0]
          ?.consumedAt,
      ).toBeNull();
    } finally {
      await db.execute(sql`drop trigger recusar_permissao_salvamento_em_teste on audit.events`);
      await db.execute(sql`drop function audit.recusar_permissao_salvamento_em_teste()`);
    }
    expect(
      (await trocarIngresso({ ingresso: ingresso.ingresso, suportaSalvamento: true })).salvamento,
    ).toBeDefined();
  });
  it("depois da concessão recusa gameplay; salva uma vez, encerra e recupera só o mesmo corpo", async () => {
    const r = await preparar({ curta: true });
    // Relógio real; a fixture só encurta a concessão assinada daquele SID descartável.
    await new Promise((resolve) =>
      setTimeout(resolve, Math.max(0, r.fim.getTime() - Date.now()) + 50),
    );
    expect(
      (await pedir("POST", "/api/sdk/v1/dados", { token: r.aberta.token, corpo: gravacao })).status,
    ).toBe(401);
    const antes = await db.select().from(permits).where(eq(permits.id, r.id));
    const estado = await pedir("GET", "/api/sdk/v1/sessao/salvamento", {
      token: r.capacidade.token,
    });
    expect(estado).toEqual({
      status: 200,
      corpo: { estado: "ready", expiraEm: r.capacidade.expiraEm.toISOString() },
    });
    expect(await db.select().from(permits).where(eq(permits.id, r.id))).toEqual(antes);
    const primeira = await salvar(r);
    expect(primeira).toMatchObject({
      status: 200,
      corpo: { estado: "completed", resultados: [{ chave: "pontos", revisao: 1 }] },
    });
    expect(await salvar(r)).toEqual(primeira);
    expect(
      await pedir("GET", "/api/sdk/v1/sessao/salvamento", { token: r.capacidade.token }),
    ).toMatchObject({ status: 200, corpo: { estado: "completed" } });
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
          .set({ revokedAt: new Date() })
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
        // História anterior ao leitor de margem, para provar que o finalizador
        // ainda recusa um sucessor já encerrado. A API nova impede essa corrida.
        const [novo] = await db
          .insert(games)
          .values({
            profileId: r.sessao.perfilId,
            deviceSessionId: r.pessoa.ator.sessaoDeAparelhoId,
            gameId: JOGO,
            expiresAt: new Date(Date.now() + 60_000),
          })
          .returning();
        if (!novo) throw new Error("Sucessor histórico ausente");
        await db.execute(
          sql`update recreio.game_sessions set ended_at=clock_timestamp(),end_reason='left',ended_seq=nextval('recreio.game_session_end_seq') where id=${novo.id}::uuid`,
        );
      }
      expect((await salvar(r)).status).toBe(401);
      expect(
        (await pedir("GET", "/api/sdk/v1/sessao/salvamento", { token: r.capacidade.token })).status,
      ).toBe(401);
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
  it("consultar o recibo não depende da trava global de encerramento", async () => {
    const r = await preparar();
    await db.transaction(async (tx) => {
      await travarEncerramentos(tx);
      expect(
        await pedir("GET", "/api/sdk/v1/sessao/salvamento", { token: r.capacidade.token }),
      ).toMatchObject({ status: 200, corpo: { estado: "ready" } });
    });
  });
  it("encerramento antecipado também limita a margem a trinta segundos", async () => {
    const r = await preparar();
    const agora = new Date();
    const inicio = new Date(agora.getTime() - 60_000);
    const fim = new Date(Math.floor(agora.getTime() / 1000) * 1000 + 30_000);
    const { emissor } = await chavesDoRecreio();
    const capacidade = await emissor.salvamento({
      ...r.sessao,
      reciboId: r.id,
      agora: inicio,
      fimDaConcessao: fim,
    });
    await db
      .update(permits)
      .set({ createdAt: inicio, renewedAt: inicio, cutoffAt: fim, expiresAt: capacidade.expiraEm })
      .where(eq(permits.id, r.id));
    await db
      .update(games)
      .set({
        startedAt: inicio,
        lastRenewedAt: inicio,
        expiresAt: fim,
        endedAt: new Date(agora.getTime() - 31_000),
        endReason: "left",
        endedSeq: sql`nextval('recreio.game_session_end_seq')`,
      })
      .where(eq(games.id, r.sessao.sid));
    expect((await salvar({ ...r, capacidade })).status).toBe(401);
    expect(
      await db.select().from(versions).where(eq(versions.profileId, r.pessoa.perfil.id)),
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
