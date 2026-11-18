import { AuditPersistenceError } from "@informach/auth";
import { db, eq, sql } from "@informach/db";
import {
  recreioDeviceSessions as devices,
  recreioGameInstances as instances,
  recreioSpaceLeases as leases,
  recreioSpaceMembers as members,
  recreioWorldHostPresences as presences,
  recreioGameSessions as sessions,
  recreioSpaceVisitInvites as visitInvites,
} from "@informach/db/schema";
import { SessaoDeJogoIdSchema } from "@informach/recreio";
import {
  type AtestadoDeEntrada,
  InstanciaRegistradaSchema,
  ReciboDePresencaSchema,
  type RenovacaoDePresenca,
  SessaoAbertaSchema,
} from "@informach/recreio/contrato";
import { criarPresencaDaConexao } from "@informach/recreio/host";
import { afterEach, expect, it, vi } from "vitest";
import { comJogadorNoConvite } from "@/features/mundos/convites-dirigidos-contexto-repository";
import { limparPresencasDeAnfitriao } from "@/features/presencas/retencao-repository";
import { atestarPresenca } from "@/features/presencas/service";
import { comJogadorEAnfitriaoNaVisita } from "@/features/visitas/contexto-repository";
import { env } from "@/lib/env";
import { aposentarInstancias, eventosCom, novoJogador } from "./apoio";
import {
  abrirPelaRota,
  cabecalhosDoHost,
  claimsDe,
  enderecoDo,
  entrarNoJogo,
  ingressoDe,
  MORADA,
  mundoDe,
  novaInstancia,
  OUTRO_JOGO,
} from "./jogo-apoio";
import { pedir } from "./rotas";

// Capacidade exclusiva de um título interno; o Morada continua sem suporte a visitas.
vi.mock("@informach/config/jogos", async (original) => {
  const real = await original<typeof import("@informach/config/jogos")>();
  const jogos = [
    ...real.JOGOS,
    {
      ...real.JOGOS[0],
      id: "jogo-de-teste",
      nome: "Atestado interno",
      rota: "/jogar/jogo-de-teste",
      capacidades: { ...real.JOGOS[0].capacidades, visitas: true },
      limites: { ...real.JOGOS[0].limites, jogadoresSimultaneosMax: 8 },
      classificacao: { faixa: "L", descritores: [], interacoes: [] },
    },
  ];
  return {
    ...real,
    JOGOS: jogos,
    jogoPorId: (id: string) => jogos.find((j) => j.id === id) ?? null,
  };
});
afterEach(() => {
  env.RECREIO_VISITS_MODE = "off";
});

it.each([
  { solicita: false, modo: "on", jogo: OUTRO_JOGO, aceita: false },
  { solicita: true, modo: "off", jogo: OUTRO_JOGO, aceita: false },
  { solicita: true, modo: "on", jogo: MORADA, aceita: false },
  { solicita: true, modo: "on", jogo: OUTRO_JOGO, aceita: true },
] as const)("negociação explícita de visitas: %j", async ({ solicita, modo, jogo, aceita }) => {
  env.RECREIO_VISITS_MODE = modo;
  const jogador = await novoJogador(),
    resposta = await pedir("POST", "/api/sdk/v1/sessao", {
      corpo: {
        ingresso: await ingressoDe(jogador, jogo),
        ...(solicita ? { suportaVisitas: true } : {}),
      },
    });
  expect(resposta.status).toBe(200);
  const aberta = SessaoAbertaSchema.parse(resposta.corpo),
    sid = SessaoDeJogoIdSchema.parse(claimsDe(aberta.token).sid),
    [sessao] = await db.select().from(sessions).where(eq(sessions.id, sid));
  expect(aberta.visitas).toBe(aceita ? true : undefined);
  expect(sessao?.supportsVisits).toBe(aceita);
  const registro = await pedir("POST", "/api/interno/v1/instancias", {
    headers: cabecalhosDoHost(jogo),
    corpo: {
      jogo,
      urlPublica: enderecoDo(jogo),
      versao: "negociacao",
      capacidade: 1,
      ...(solicita ? { suportaVisitas: true } : {}),
    },
  });
  expect(registro.status).toBe(200);
  expect(registro.corpo).toMatchObject({ batimentoMs: 10000, posseTtlMs: 30000 });
  expect(registro.corpo).toEqual(
    aceita
      ? expect.objectContaining({ visitas: true })
      : { instanciaId: expect.any(String), batimentoMs: 10000, posseTtlMs: 30000 },
  );
  const [instancia] = await db
    .select()
    .from(instances)
    .where(eq(instances.id, InstanciaRegistradaSchema.parse(registro.corpo).instanciaId));
  expect(instancia?.supportsVisits).toBe(aceita);
});

it.each([false, true])(
  "recuperar abertura conserva capacidade persistida %s sem promover o SID",
  async (primeira) => {
    env.RECREIO_VISITS_MODE = primeira ? "on" : "off";
    const jogador = await novoJogador(),
      corpo = {
        ingresso: await ingressoDe(jogador, OUTRO_JOGO),
        chaveDeTroca: "a".repeat(43),
        suportaVisitas: true,
      },
      abrir = async (pedido: unknown) => {
        const r = await pedir("POST", "/api/sdk/v1/sessao", { corpo: pedido });
        expect(r.status).toBe(200);
        return SessaoAbertaSchema.parse(r.corpo);
      },
      inicial = await abrir(corpo),
      sid = SessaoDeJogoIdSchema.parse(claimsDe(inicial.token).sid);
    expect(inicial.visitas).toBe(primeira ? true : undefined);
    env.RECREIO_VISITS_MODE = primeira ? "off" : "on";
    const repetida = await abrir(corpo);
    expect(repetida.visitas).toBe(primeira ? true : undefined);
    expect(claimsDe(repetida.token).sid).toBe(sid);
    expect(
      (await abrir({ ingresso: corpo.ingresso, chaveDeTroca: corpo.chaveDeTroca })).visitas,
    ).toBeUndefined();
    expect((await db.select().from(sessions).where(eq(sessions.id, sid)))[0]?.supportsVisits).toBe(
      primeira,
    );
  },
);

it("adicionar a opção ao retry de cliente antigo não promove a sessão já aberta", async () => {
  env.RECREIO_VISITS_MODE = "on";
  const jogador = await novoJogador(),
    corpo = { ingresso: await ingressoDe(jogador, OUTRO_JOGO), chaveDeTroca: "b".repeat(43) },
    inicial = await pedir("POST", "/api/sdk/v1/sessao", { corpo }),
    repetida = await pedir("POST", "/api/sdk/v1/sessao", {
      corpo: { ...corpo, suportaVisitas: true },
    });
  expect(inicial.status).toBe(200);
  expect(repetida.status).toBe(200);
  const a = SessaoAbertaSchema.parse(inicial.corpo),
    b = SessaoAbertaSchema.parse(repetida.corpo);
  expect(a.visitas).toBeUndefined();
  expect(b.visitas).toBeUndefined();
  expect(claimsDe(a.token).sid).toBe(claimsDe(b.token).sid);
});

it.each(["cliente", "instancia"] as const)(
  "%s sem adesão não publica presença mesmo com manifesto e modo habilitados",
  async (legado) => {
    const c = await cenario(OUTRO_JOGO, {
      cliente: legado !== "cliente",
      instancia: legado !== "instancia",
    });
    await expect(entrar(c)).rejects.toMatchObject({ codigo: "INDISPONIVEL" });
    expect(await db.select().from(presences).where(eq(presences.spaceId, c.mundoId))).toHaveLength(
      0,
    );
  },
);
async function cenario(jogo = OUTRO_JOGO, opcoes = { cliente: true, instancia: true }) {
  env.RECREIO_VISITS_MODE = "on";
  await aposentarInstancias();
  const jogador = await novoJogador(),
    mundoId = await mundoDe(jogador, jogo),
    sessao = await entrarNoJogo(jogador, jogo, opcoes.cliente ? { suportaVisitas: true } : {}),
    instancia = await novaInstancia(jogo, 10, opcoes.instancia ? { suportaVisitas: true } : {});
  expect((await abrirPelaRota(sessao, mundoId)).status).toBe(200);
  const posse = await instancia.cliente.reivindicarPosse(mundoId);
  const host = { jogo, instanciaId: instancia.instanciaId },
    pedido: AtestadoDeEntrada = {
      operacao: "entrar",
      cerca: posse.cerca,
      sid: sessao.sid,
      perfilId: jogador.perfil.id,
      chaveDeEntrada: crypto.randomUUID(),
    },
    caminho = `/api/interno/v1/mundos/${mundoId}/presencas`,
    headers = cabecalhosDoHost(jogo, host.instanciaId);
  return { jogador, mundoId, sessao, instancia, host, pedido, caminho, headers };
}
type Cenario = Awaited<ReturnType<typeof cenario>>;
it.each(["tardia", "perdida"] as const)(
  "produtor encerra presença real após resposta %s e desconexão, sem terminar o SID",
  async (resposta) => {
    const c = await cenario();
    let conectado = true;
    const { operacao: _operacao, ...pedido } = c.pedido;
    const produtor = criarPresencaDaConexao({
      entrada: { mundoId: c.mundoId, ...pedido },
      estaConectado: () => conectado,
      host: {
        consultarPresenca: (p) => c.instancia.cliente.consultarPresenca(p),
        async atestarPresenca(p) {
          const recibo = await c.instancia.cliente.atestarPresenca(p);
          if (p.operacao === "entrar") {
            conectado = false;
            env.RECREIO_VISITS_MODE = "off";
            if (resposta === "perdida") throw new Error("Resposta HTTP descartada após commit");
          }
          return recibo;
        },
      },
    });
    if (resposta === "perdida")
      await expect(produtor.atualizar()).rejects.toThrow("Resposta HTTP descartada após commit");
    else await produtor.atualizar();
    await produtor.encerrar();
    expect(produtor.concluida).toBe(true);
    expect(produtor.renovacao()).toBeNull();
    const linhas = await db.select().from(presences).where(eq(presences.spaceId, c.mundoId));
    expect(linhas).toHaveLength(1);
    const linha = linhas[0];
    if (!linha) throw new Error("Presença real ausente");
    expect(linha).toMatchObject({
      state: "closed",
      closeReason: "left",
      clientKey: pedido.chaveDeEntrada,
    });
    expect(
      (await db.select().from(sessions).where(eq(sessions.id, c.sessao.sid)))[0]?.endedAt,
    ).toBeNull();
    expect(await db.select().from(members).where(eq(members.spaceId, c.mundoId))).toHaveLength(1);
    expect(
      (await eventosCom("presenceId", linha.id)).filter(
        (e) => e.eventType === "recreio.host_presence_started",
      ),
    ).toHaveLength(1);
    expect(
      (await eventosCom("presenceId", linha.id)).filter(
        (e) => e.eventType === "recreio.host_presence_closed",
      ),
    ).toHaveLength(1);
  },
);
const entrar = (c: Cenario) => atestarPresenca(c.host, c.mundoId, c.pedido);
const saida = (c: Cenario, presencaId: string) => ({
  operacao: "sair",
  cerca: c.pedido.cerca,
  presencaId,
});
const renovar = (c: Cenario, presencaId: string): RenovacaoDePresenca => ({
  mundoId: c.mundoId,
  cerca: c.pedido.cerca,
  sid: c.sessao.sid,
  perfilId: c.jogador.perfil.id,
  presencaId,
});

// Fundação do contexto, sem serviço de convite/aceite ou admissão de visitante.
async function contextoDaVisita() {
  const c = await cenario(),
    presenca = await entrar(c),
    destino = await novoJogador(),
    agora = new Date(),
    [prova] = await db.select().from(presences).where(eq(presences.id, presenca.presencaId));
  if (!prova) throw new Error("Presença ausente");
  const [convite] = await db
    .insert(visitInvites)
    .values({
      spaceId: c.mundoId,
      hostPresenceId: presenca.presencaId,
      hostSessionId: c.sessao.sid,
      hostMemberId: prova.hostMemberId,
      originProfileId: c.jogador.perfil.id,
      targetProfileId: destino.perfil.id,
      clientKey: crypto.randomUUID(),
      requestHash: "c".repeat(64),
      managementRevision: 1,
      friendshipRevision: 1,
      originPolicyVersion: 1,
      targetPolicyVersion: 1,
      createdAt: agora,
      expiresAt: new Date(agora.getTime() + 600_000),
      retainUntil: new Date(agora.getTime() + 30 * 86_400_000),
    })
    .returning();
  if (!convite) throw new Error("Convite fixture ausente");
  const autor = {
      perfilId: destino.perfil.id,
      sessaoDeAparelhoId: destino.ator.sessaoDeAparelhoId,
    },
    pontas = {
      mundoId: c.mundoId,
      origemId: c.jogador.perfil.id,
      destinoId: destino.perfil.id,
      conviteId: convite.id,
    };
  return { c, presenca, destino, convite, autor, pontas };
}

it("contexto revalida anfitrião sem inserir membro ou concessão e mantém namespaces separados", async () => {
  const r = await contextoDaVisita(),
    antes = await db.select().from(members).where(eq(members.spaceId, r.c.mundoId));
  expect(
    await comJogadorEAnfitriaoNaVisita(
      r.autor,
      r.pontas,
      r.presenca.presencaId,
      async (_tx, _ctx, host) => host.presenca.hostSessionId,
    ),
  ).toBe(r.c.sessao.sid);
  await expect(comJogadorNoConvite(r.autor, r.pontas, async () => true)).rejects.toMatchObject({
    code: "PEDIDO",
  });
  expect(await db.select().from(members).where(eq(members.spaceId, r.c.mundoId))).toEqual(antes);
});

it.each([
  { tipo: "sessao", esperado: { codigo: "SESSAO_ENCERRADA" } },
  { tipo: "aparelho", esperado: { codigo: "SESSAO_INVALIDA" } },
  { tipo: "cobertura", esperado: { codigo: "ACESSO_NEGADO" } },
  { tipo: "posse", esperado: { codigo: "POSSE_PERDIDA" } },
  { tipo: "presenca", esperado: { code: "PEDIDO" } },
] as const)(
  "perder $tipo do anfitrião recusa escrita positiva sem depender da conta destinatária",
  async ({ tipo, esperado }) => {
    const r = await contextoDaVisita();
    if (tipo === "sessao")
      await pedir("POST", "/api/sdk/v1/sessao/sair", { token: r.c.sessao.token });
    else if (tipo === "aparelho")
      await db
        .update(devices)
        .set({ revokedAt: new Date() })
        .where(eq(devices.id, r.c.jogador.ator.sessaoDeAparelhoId));
    else if (tipo === "cobertura")
      await db.execute(
        sql`update recreio.entitlements set starts_at=clock_timestamp()-interval '1 hour',ends_at=clock_timestamp()-interval '1 minute' where group_id=(select group_id from recreio.profiles where id=${r.c.jogador.perfil.id})`,
      );
    else if (tipo === "posse")
      await db
        .update(leases)
        .set({ expiresAt: new Date(Date.now() - 1) })
        .where(eq(leases.spaceId, r.c.mundoId));
    else
      await r.c.instancia.cliente.atestarPresenca({
        mundoId: r.c.mundoId,
        operacao: "sair",
        cerca: r.c.pedido.cerca,
        presencaId: r.presenca.presencaId,
      });
    await expect(
      comJogadorEAnfitriaoNaVisita(r.autor, r.pontas, r.presenca.presencaId, async () => true),
    ).rejects.toMatchObject(esperado);
  },
);

it("presença nova não substitui a prova original de um convite", async () => {
  const r = await contextoDaVisita();
  await r.c.instancia.cliente.atestarPresenca({
    mundoId: r.c.mundoId,
    operacao: "sair",
    cerca: r.c.pedido.cerca,
    presencaId: r.presenca.presencaId,
  });
  const nova = await r.c.instancia.cliente.atestarPresenca({
    mundoId: r.c.mundoId,
    ...r.c.pedido,
    chaveDeEntrada: crypto.randomUUID(),
  });
  await expect(
    comJogadorEAnfitriaoNaVisita(r.autor, r.pontas, nova.presencaId, async () => true),
  ).rejects.toMatchObject({ code: "PEDIDO" });
});

it("expiração da presença durante o efeito reverte o efeito antes do commit", async () => {
  const r = await contextoDaVisita();
  await db
    .update(presences)
    .set({ expiresAt: new Date(Date.now() + 1100) })
    .where(eq(presences.id, r.presenca.presencaId));
  await expect(
    comJogadorEAnfitriaoNaVisita(r.autor, r.pontas, r.presenca.presencaId, async (tx) => {
      await tx
        .update(visitInvites)
        .set({ state: "revoked", finishedAt: new Date() })
        .where(eq(visitInvites.id, r.convite.id));
      await tx.execute(sql`select pg_sleep(1.3)`);
      return true;
    }),
  ).rejects.toMatchObject({ code: "PEDIDO" });
  expect(
    (await db.select().from(visitInvites).where(eq(visitInvites.id, r.convite.id)))[0]?.state,
  ).toBe("pending");
});

it("modo desligado recusa o contexto positivo mesmo com presença e capacidades antigas", async () => {
  const r = await contextoDaVisita();
  env.RECREIO_VISITS_MODE = "off";
  await expect(
    comJogadorEAnfitriaoNaVisita(r.autor, r.pontas, r.presenca.presencaId, async () => true),
  ).rejects.toMatchObject({ codigo: "INDISPONIVEL" });
});

it("renovação HTTP em lote conserva janela/identidade e distingue prova alheia sem encerrar SID", async () => {
  const c = await cenario(),
    criada = await entrar(c),
    [antes] = await db.select().from(presences).where(eq(presences.id, criada.presencaId));
  await c.instancia.cliente.batimento({
    mundos: [{ mundoId: c.mundoId, cerca: c.pedido.cerca, jogadores: 1, tick: 0 }],
    cursor: null,
  });
  const desconhecida = crypto.randomUUID(),
    resposta = await c.instancia.cliente.renovarPresencas([
      renovar(c, criada.presencaId),
      renovar(c, desconhecida),
    ]);
  expect(resposta.presencas[0]).toMatchObject({ presencaId: criada.presencaId, estado: "ok" });
  expect(resposta.presencas[1]).toEqual({ presencaId: desconhecida, estado: "perdida" });
  const [depois] = await db.select().from(presences).where(eq(presences.id, criada.presencaId));
  expect(depois).toMatchObject({
    id: antes?.id,
    createdAt: antes?.createdAt,
    validUntil: antes?.validUntil,
    retainUntil: antes?.retainUntil,
    requestHash: antes?.requestHash,
    clientKey: antes?.clientKey,
    state: "active",
  });
  expect(depois?.expiresAt.getTime()).toBeGreaterThan(antes?.expiresAt.getTime() ?? Infinity);
  expect(depois?.expiresAt.getTime()).toBeLessThanOrEqual(
    (await db.select().from(leases).where(eq(leases.spaceId, c.mundoId)))[0]?.expiresAt.getTime() ??
      0,
  );
  expect(
    (await db.select().from(sessions).where(eq(sessions.id, c.sessao.sid)))[0]?.endedAt,
  ).toBeNull();
});

it("encerramento concorrente com renovação nunca reabre a presença", async () => {
  const c = await cenario(),
    criada = await entrar(c);
  await Promise.all([
    c.instancia.cliente.atestarPresenca({
      mundoId: c.mundoId,
      operacao: "sair",
      cerca: c.pedido.cerca,
      presencaId: criada.presencaId,
    }),
    c.instancia.cliente.renovarPresencas([renovar(c, criada.presencaId)]),
  ]);
  expect(
    (await c.instancia.cliente.renovarPresencas([renovar(c, criada.presencaId)])).presencas,
  ).toEqual([{ presencaId: criada.presencaId, estado: "perdida" }]);
  expect(
    (await db.select().from(presences).where(eq(presences.id, criada.presencaId)))[0]?.state,
  ).toBe("closed");
});

it.each([1, 25])("prova vencida há %s horas não renova nem reabre", async (horas) => {
  const c = await cenario(),
    criada = await entrar(c);
  await db.execute(
    sql`update recreio.world_host_presences set created_at=created_at-make_interval(hours=>${horas}), updated_at=updated_at-make_interval(hours=>${horas}),expires_at=expires_at-make_interval(hours=>${horas}),valid_until=valid_until-make_interval(hours=>${horas}),retain_until=retain_until-make_interval(hours=>${horas}) where id=${criada.presencaId}`,
  );
  const [antes] = await db.select().from(presences).where(eq(presences.id, criada.presencaId));
  expect(
    (await c.instancia.cliente.renovarPresencas([renovar(c, criada.presencaId)])).presencas,
  ).toEqual([{ presencaId: criada.presencaId, estado: "perdida" }]);
  expect((await db.select().from(presences).where(eq(presences.id, criada.presencaId)))[0]).toEqual(
    antes,
  );
});

it("fim do SID impede renovar e modo desligado conserva a redução gratuita", async () => {
  const c = await cenario(),
    criada = await entrar(c);
  expect((await pedir("POST", "/api/sdk/v1/sessao/sair", { token: c.sessao.token })).status).toBe(
    200,
  );
  expect(
    (await c.instancia.cliente.renovarPresencas([renovar(c, criada.presencaId)])).presencas,
  ).toEqual([{ presencaId: criada.presencaId, estado: "perdida" }]);
  env.RECREIO_VISITS_MODE = "off";
  await expect(
    c.instancia.cliente.renovarPresencas([renovar(c, criada.presencaId)]),
  ).rejects.toMatchObject({ codigo: "INDISPONIVEL" });
  expect(
    (
      await c.instancia.cliente.atestarPresenca({
        mundoId: c.mundoId,
        operacao: "sair",
        cerca: c.pedido.cerca,
        presencaId: criada.presencaId,
      })
    ).estado,
  ).toBe("closed");
});

it("lote exige autenticação, não repete presença, limita itens/corpo e não aceita identidade da conta", async () => {
  const c = await cenario(),
    criada = await entrar(c),
    p = renovar(c, criada.presencaId),
    caminho = "/api/interno/v1/presencas/renovar";
  expect((await pedir("POST", caminho, { corpo: { presencas: [p] } })).status).toBe(401);
  for (const presencas of [
    [],
    [p, p],
    Array.from({ length: 65 }, () => ({ ...p, presencaId: crypto.randomUUID() })),
    [{ ...p, contaId: c.jogador.conta.id }],
  ])
    expect(
      (await pedir("POST", caminho, { headers: c.headers, corpo: { presencas } })).status,
    ).toBe(400);
  expect(
    (
      await pedir("POST", caminho, {
        headers: c.headers,
        corpo: { presencas: [p], extra: "x".repeat(33000) },
      })
    ).status,
  ).toBe(413);
});

it.each(["cerca", "perfil", "instancia"] as const)(
  "renovação não aceita %s cruzada",
  async (tipo) => {
    const c = await cenario(),
      criada = await entrar(c),
      p = renovar(c, criada.presencaId),
      cliente =
        tipo === "instancia"
          ? (await novaInstancia(c.host.jogo, 10, { suportaVisitas: true })).cliente
          : c.instancia.cliente;
    if (tipo === "cerca") p.cerca++;
    if (tipo === "perfil") p.perfilId = (await novoJogador()).perfil.id;
    expect((await cliente.renovarPresencas([p])).presencas).toEqual([
      { presencaId: criada.presencaId, estado: "perdida" },
    ]);
  },
);

it.each(["banco", "posse", "sessao"] as const)(
  "falha de %s durante renovação não confirma prazo novo",
  async (tipo) => {
    const c = await cenario(),
      criada = await entrar(c),
      [antes] = await db.select().from(presences).where(eq(presences.id, criada.presencaId));
    await db.execute(
      tipo === "banco"
        ? sql`create function recreio.renovacao_presenca_teste() returns trigger language plpgsql as $$ begin raise exception 'presence unavailable'; end $$`
        : sql`create function recreio.renovacao_presenca_teste() returns trigger language plpgsql as $$ begin perform pg_sleep(1.3); return new; end $$`,
    );
    await db.execute(
      sql`create trigger renovacao_presenca_teste before update on recreio.world_host_presences for each row execute function recreio.renovacao_presenca_teste()`,
    );
    try {
      if (tipo === "posse")
        await db
          .update(leases)
          .set({ expiresAt: new Date(Date.now() + 1100) })
          .where(eq(leases.spaceId, c.mundoId));
      if (tipo === "sessao")
        await db
          .update(sessions)
          .set({ expiresAt: new Date(Date.now() + 1100) })
          .where(eq(sessions.id, c.sessao.sid));
      const r = await pedir("POST", "/api/interno/v1/presencas/renovar", {
        headers: c.headers,
        corpo: { presencas: [renovar(c, criada.presencaId)] },
      });
      expect(r.status).toBe(tipo === "banco" ? 503 : 200);
      if (tipo !== "banco")
        expect(r.corpo).toEqual({
          presencas: [{ presencaId: criada.presencaId, estado: "perdida" }],
        });
    } finally {
      await db.execute(sql`drop trigger renovacao_presenca_teste on recreio.world_host_presences`);
      await db.execute(sql`drop function recreio.renovacao_presenca_teste()`);
    }
    expect(
      (await db.select().from(presences).where(eq(presences.id, criada.presencaId)))[0],
    ).toEqual(antes);
  },
);

it("cliente HTTP atesta entrada e saída reais, com replay fechado e modo desligado", async () => {
  const c = await cenario(),
    cliente = c.instancia.cliente,
    entrada = { mundoId: c.mundoId, ...c.pedido },
    criada = await cliente.atestarPresenca(entrada);
  expect(criada.estado).toBe("active");
  env.RECREIO_VISITS_MODE = "off";
  const fechada = await cliente.atestarPresenca({
    mundoId: c.mundoId,
    operacao: "sair",
    cerca: c.pedido.cerca,
    presencaId: criada.presencaId,
  });
  expect(fechada.estado).toBe("closed");
  expect(await cliente.atestarPresenca(entrada)).toEqual(fechada);
  expect(
    (await eventosCom("presenceId", criada.presencaId)).filter(
      (e) => e.eventType === "recreio.host_presence_closed",
    ),
  ).toHaveLength(1);
  expect(
    (await db.select().from(sessions).where(eq(sessions.id, c.sessao.sid)))[0]?.endedAt,
  ).toBeNull();
});

it("dois HTTP concorrentes recuperam o mesmo atestado sem duplicar presença ou auditoria", async () => {
  const c = await cenario(),
    antes = await db.select().from(members).where(eq(members.spaceId, c.mundoId));
  const respostas = await Promise.all([
    pedir("POST", c.caminho, { headers: c.headers, corpo: c.pedido }),
    pedir("POST", c.caminho, { headers: c.headers, corpo: c.pedido }),
  ]);
  expect(respostas.map((r) => r.status)).toEqual([200, 200]);
  expect(respostas[0]?.corpo).toEqual(respostas[1]?.corpo);
  const recebido = ReciboDePresencaSchema.parse(respostas[0]?.corpo);
  expect(recebido.estado).toBe("active");
  const [linha] = await db.select().from(presences).where(eq(presences.id, recebido.presencaId));
  expect(linha).toMatchObject({
    spaceId: c.mundoId,
    hostProfileId: c.jogador.perfil.id,
    hostSessionId: c.sessao.sid,
    instanceId: c.host.instanciaId,
    fence: c.pedido.cerca,
  });
  expect(linha?.expiresAt.getTime()).toBeLessThanOrEqual(
    (linha?.updatedAt.getTime() ?? 0) + 30_000,
  );
  expect(await db.select().from(members).where(eq(members.spaceId, c.mundoId))).toEqual(antes);
  expect(
    (await eventosCom("presenceId", recebido.presencaId)).filter(
      (e) => e.eventType === "recreio.host_presence_started",
    ),
  ).toHaveLength(1);
});

it("desligar a ativação mantém recibo e saída disponíveis, sem renovar ou reabrir a prova", async () => {
  const c = await cenario(),
    criada = await entrar(c);
  env.RECREIO_VISITS_MODE = "off";
  expect(await entrar(c)).toEqual(criada);
  await expect(
    atestarPresenca(c.host, c.mundoId, { ...c.pedido, chaveDeEntrada: crypto.randomUUID() }),
  ).rejects.toMatchObject({ codigo: "INDISPONIVEL" });
  const fechada = await atestarPresenca(c.host, c.mundoId, saida(c, criada.presencaId));
  expect(fechada.estado).toBe("closed");
  expect(fechada.expiraEm).toBe(criada.expiraEm);
  expect(await atestarPresenca(c.host, c.mundoId, saida(c, criada.presencaId))).toEqual(fechada);
  expect(await entrar(c)).toEqual(fechada);
  expect(
    (await eventosCom("presenceId", criada.presencaId)).filter(
      (e) => e.eventType === "recreio.host_presence_closed",
    ),
  ).toHaveLength(1);
});

it("chave repetida com corpo diferente conflita e outra entrada exige encerrar a anterior", async () => {
  const c = await cenario(),
    criada = await entrar(c);
  await expect(
    atestarPresenca(c.host, c.mundoId, { ...c.pedido, cerca: c.pedido.cerca + 1 }),
  ).rejects.toMatchObject({ code: "CONFLITO" });
  const nova = { ...c.pedido, chaveDeEntrada: crypto.randomUUID() };
  await expect(atestarPresenca(c.host, c.mundoId, nova)).rejects.toMatchObject({
    code: "CONFLITO",
  });
  expect(await pedir("POST", c.caminho, { headers: c.headers, corpo: nova })).toMatchObject({
    status: 409,
    corpo: { codigo: "REVISAO_DIVERGENTE" },
  });
  await atestarPresenca(c.host, c.mundoId, saida(c, criada.presencaId));
  const atual = await atestarPresenca(c.host, c.mundoId, nova);
  expect(atual.presencaId).not.toBe(criada.presencaId);
  expect(atual.estado).toBe("active");
  expect((await entrar(c)).estado).toBe("closed");
});

it("HTTP exige segredo e instância do jogo, rejeita identidade excedente e limita o corpo", async () => {
  const c = await cenario();
  expect((await pedir("POST", c.caminho, { corpo: c.pedido })).status).toBe(401);
  expect((await pedir("POST", c.caminho, { token: c.sessao.token, corpo: c.pedido })).status).toBe(
    401,
  );
  expect(
    (
      await pedir("POST", c.caminho, {
        headers: c.headers,
        corpo: { ...c.pedido, contaId: c.jogador.conta.id },
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await pedir("POST", c.caminho, {
        headers: c.headers,
        corpo: { ...c.pedido, extra: "x".repeat(5000) },
      })
    ).status,
  ).toBe(413);
  const outra = await novaInstancia();
  expect(
    (
      await pedir("POST", c.caminho, {
        headers: cabecalhosDoHost(c.host.jogo, outra.instanciaId),
        corpo: c.pedido,
      })
    ).status,
  ).toBe(401);
  expect(await db.select().from(presences).where(eq(presences.spaceId, c.mundoId))).toHaveLength(0);
});

it("outra instância e cerca vencida não publicam ou encerram a presença alheia", async () => {
  const c = await cenario(),
    criada = await entrar(c),
    outra = await novaInstancia(c.host.jogo),
    host = { ...c.host, instanciaId: outra.instanciaId };
  await expect(
    atestarPresenca(host, c.mundoId, { ...c.pedido, chaveDeEntrada: crypto.randomUUID() }),
  ).rejects.toMatchObject({ codigo: "POSSE_PERDIDA" });
  await expect(atestarPresenca(host, c.mundoId, saida(c, criada.presencaId))).rejects.toMatchObject(
    { codigo: "NAO_ENCONTRADO" },
  );
  await expect(
    atestarPresenca(c.host, c.mundoId, {
      ...saida(c, criada.presencaId),
      cerca: c.pedido.cerca + 1,
    }),
  ).rejects.toMatchObject({ codigo: "NAO_ENCONTRADO" });
  expect(
    (await db.select().from(presences).where(eq(presences.id, criada.presencaId)))[0]?.state,
  ).toBe("active");
});

it("SID e perfil cruzados ou jogador sem participação permanente não viram anfitrião", async () => {
  const c = await cenario(),
    outro = await novoJogador(),
    sessao = await entrarNoJogo(outro, c.host.jogo);
  await expect(
    atestarPresenca(c.host, c.mundoId, { ...c.pedido, sid: sessao.sid }),
  ).rejects.toMatchObject({ codigo: "SESSAO_ENCERRADA" });
  await expect(
    atestarPresenca(c.host, c.mundoId, { ...c.pedido, sid: sessao.sid, perfilId: outro.perfil.id }),
  ).rejects.toMatchObject({ codigo: "NAO_MEMBRO" });
  expect(
    (await db.select().from(sessions).where(eq(sessions.id, sessao.sid)))[0]?.spaceId,
  ).toBeNull();
  expect(await db.select().from(presences).where(eq(presences.spaceId, c.mundoId))).toHaveLength(0);
});

it("fim do SID impede nova presença, mas permite encerrar o recibo próprio com a ativação desligada", async () => {
  const c = await cenario(),
    criada = await entrar(c);
  expect((await pedir("POST", "/api/sdk/v1/sessao/sair", { token: c.sessao.token })).status).toBe(
    200,
  );
  await expect(
    atestarPresenca(c.host, c.mundoId, { ...c.pedido, chaveDeEntrada: crypto.randomUUID() }),
  ).rejects.toMatchObject({ codigo: "SESSAO_ENCERRADA" });
  env.RECREIO_VISITS_MODE = "off";
  expect((await atestarPresenca(c.host, c.mundoId, saida(c, criada.presencaId))).estado).toBe(
    "closed",
  );
});

it("manifesto sem capacidade e modo desligado recusam criação sem ativar visitas no Morada", async () => {
  const c = await cenario();
  env.RECREIO_VISITS_MODE = "off";
  await expect(entrar(c)).rejects.toMatchObject({ codigo: "INDISPONIVEL" });
  const morada = await cenario(MORADA);
  await expect(entrar(morada)).rejects.toMatchObject({ codigo: "INDISPONIVEL" });
  expect(
    await db.select().from(presences).where(eq(presences.spaceId, morada.mundoId)),
  ).toHaveLength(0);
});

it.each(["auditoria", "posse", "sessao"] as const)(
  "%s perdida durante a confirmação reverte o atestado",
  async (tipo) => {
    const c = await cenario();
    await db.execute(
      tipo === "auditoria"
        ? sql`create function audit.presenca_teste() returns trigger language plpgsql as $$ begin if new.event_type='recreio.host_presence_started' then raise exception 'audit unavailable'; end if; return new; end $$`
        : sql`create function audit.presenca_teste() returns trigger language plpgsql as $$ begin if new.event_type='recreio.host_presence_started' then perform pg_sleep(1.3); end if; return new; end $$`,
    );
    await db.execute(
      sql`create trigger presenca_teste before insert on audit.events for each row execute function audit.presenca_teste()`,
    );
    try {
      if (tipo === "posse")
        await db
          .update(leases)
          .set({ expiresAt: new Date(Date.now() + 1100) })
          .where(eq(leases.spaceId, c.mundoId));
      if (tipo === "sessao")
        await db
          .update(sessions)
          .set({ expiresAt: new Date(Date.now() + 1100) })
          .where(eq(sessions.id, c.sessao.sid));
      if (tipo === "auditoria")
        await expect(entrar(c)).rejects.toBeInstanceOf(AuditPersistenceError);
      else if (tipo === "sessao")
        await expect(entrar(c)).rejects.toMatchObject({ codigo: "SESSAO_ENCERRADA" });
      else await expect(entrar(c)).rejects.toMatchObject({ code: "CONFLITO" });
    } finally {
      await db.execute(sql`drop trigger presenca_teste on audit.events`);
      await db.execute(sql`drop function audit.presenca_teste()`);
    }
    expect(await db.select().from(presences).where(eq(presences.spaceId, c.mundoId))).toHaveLength(
      0,
    );
  },
);

it("presença vencida encerra uma vez com ativação desligada e conserva o recibo até a retenção", async () => {
  const c = await cenario(),
    criada = await entrar(c);
  await db.execute(
    sql`update recreio.world_host_presences set created_at=created_at-interval '1 hour',updated_at=updated_at-interval '1 hour',expires_at=expires_at-interval '1 hour',valid_until=valid_until-interval '1 hour',retain_until=retain_until-interval '1 hour' where id=${criada.presencaId}`,
  );
  env.RECREIO_VISITS_MODE = "off";
  expect((await limparPresencasDeAnfitriao()).presencasDeAnfitriaoVencidas).toBeGreaterThanOrEqual(
    1,
  );
  await limparPresencasDeAnfitriao();
  expect(
    (await db.select().from(presences).where(eq(presences.id, criada.presencaId)))[0],
  ).toMatchObject({ state: "closed", closeReason: "expired" });
  expect(
    (await eventosCom("presenceId", criada.presencaId)).filter(
      (e) => e.eventType === "recreio.host_presence_closed",
    ),
  ).toHaveLength(1);
});

it("retenção remove no máximo 500 provas antigas por chamada sem apagar a atual ou seus recursos", async () => {
  const c = await cenario(),
    criada = await entrar(c);
  const [base] = await db.select().from(presences).where(eq(presences.id, criada.presencaId));
  if (!base) throw new Error("Prova base ausente");
  const inicio = new Date(Date.now() - 32 * 24 * 60 * 60_000),
    janela = new Date(inicio.getTime() + 24 * 60 * 60_000);
  await db.insert(presences).values(
    Array.from({ length: 601 }, () => ({
      ...base,
      id: crypto.randomUUID(),
      clientKey: crypto.randomUUID(),
      state: "closed" as const,
      closeReason: "left" as const,
      createdAt: inicio,
      updatedAt: inicio,
      closedAt: inicio,
      expiresAt: new Date(inicio.getTime() + 30_000),
      validUntil: janela,
      retainUntil: new Date(janela.getTime() + 30 * 24 * 60 * 60_000),
    })),
  );
  expect((await limparPresencasDeAnfitriao()).presencasDeAnfitriaoApagadas).toBe(500);
  expect((await limparPresencasDeAnfitriao()).presencasDeAnfitriaoApagadas).toBe(101);
  expect((await limparPresencasDeAnfitriao()).presencasDeAnfitriaoApagadas).toBe(0);
  expect(await db.select().from(presences).where(eq(presences.id, criada.presencaId))).toHaveLength(
    1,
  );
  expect(await db.select().from(members).where(eq(members.spaceId, c.mundoId))).toHaveLength(1);
  expect(await db.select().from(sessions).where(eq(sessions.id, c.sessao.sid))).toHaveLength(1);
});
