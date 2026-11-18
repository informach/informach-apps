import { AuditPersistenceError } from "@informach/auth";
import { db, eq, sql } from "@informach/db";
import {
  recreioSpaceLeases as leases,
  recreioSpaceMembers as members,
  recreioWorldHostPresences as presences,
  recreioGameSessions as sessions,
} from "@informach/db/schema";
import { type AtestadoDeEntrada, ReciboDePresencaSchema } from "@informach/recreio/contrato";
import { afterEach, expect, it, vi } from "vitest";
import { limparPresencasDeAnfitriao } from "@/features/presencas/retencao-repository";
import { atestarPresenca } from "@/features/presencas/service";
import { env } from "@/lib/env";
import { aposentarInstancias, eventosCom, novoJogador } from "./apoio";
import {
  abrirPelaRota,
  cabecalhosDoHost,
  entrarNoJogo,
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
async function cenario(jogo = OUTRO_JOGO) {
  env.RECREIO_VISITS_MODE = "on";
  await aposentarInstancias();
  const jogador = await novoJogador(),
    mundoId = await mundoDe(jogador, jogo),
    sessao = await entrarNoJogo(jogador, jogo),
    instancia = await novaInstancia(jogo);
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
const entrar = (c: Cenario) => atestarPresenca(c.host, c.mundoId, c.pedido);
const saida = (c: Cenario, presencaId: string) => ({
  operacao: "sair",
  cerca: c.pedido.cerca,
  presencaId,
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
