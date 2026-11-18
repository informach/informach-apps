import { db, eq } from "@informach/db";
import { recreioWorldHostPresences as presences } from "@informach/db/schema";
import { expect, it } from "vitest";
import {
  aposentarInstancias,
  CHECAGEM,
  codigoDoBanco,
  novoJogador,
  RESTRICAO,
  UNICO,
} from "./apoio";
import { abrirPelaRota, entrarNoJogo, mundoDe, novaInstancia } from "./jogo-apoio";

type Registro = typeof presences.$inferInsert;
async function cenario() {
  await aposentarInstancias();
  const jogador = await novoJogador(),
    mundoId = await mundoDe(jogador),
    sessao = await entrarNoJogo(jogador),
    instancia = await novaInstancia();
  expect((await abrirPelaRota(sessao, mundoId)).status).toBe(200);
  const posse = await instancia.cliente.reivindicarPosse(mundoId);
  const entrada = await instancia.cliente.verificarEntrada({
    mundoId,
    cerca: posse.cerca,
    sid: sessao.sid,
    perfilId: jogador.perfil.id,
  });
  const agora = new Date(),
    janela = agora.getTime() + 24 * 60 * 60_000;
  const registro: Registro = {
    spaceId: mundoId,
    hostProfileId: jogador.perfil.id,
    hostSessionId: sessao.sid,
    hostMemberId: entrada.membroId,
    instanceId: instancia.instanciaId,
    fence: posse.cerca,
    clientKey: crypto.randomUUID(),
    requestHash: "a".repeat(64),
    createdAt: agora,
    updatedAt: agora,
    expiresAt: new Date(agora.getTime() + 30_000),
    validUntil: new Date(janela),
    retainUntil: new Date(janela + 30 * 24 * 60 * 60_000),
  };
  return { jogador, mundoId, sessao, instancia, registro, agora };
}

it("presença referencia membro, SID, posse e instância admitidos e recusa duplicação", async () => {
  const c = await cenario();
  const [linha] = await db.insert(presences).values(c.registro).returning();
  expect(linha).toMatchObject({
    hostMemberId: c.registro.hostMemberId,
    hostSessionId: c.sessao.sid,
    spaceId: c.mundoId,
    state: "active",
    closedAt: null,
  });
  expect(
    await codigoDoBanco(db.insert(presences).values({ ...c.registro, id: crypto.randomUUID() })),
  ).toBe(UNICO);
  expect(
    await codigoDoBanco(
      db.insert(presences).values({ ...c.registro, clientKey: crypto.randomUUID() }),
    ),
  ).toBe(UNICO);
  expect(await db.select().from(presences).where(eq(presences.spaceId, c.mundoId))).toHaveLength(1);
});

it.each(["membro", "sessao", "posse", "instancia"] as const)(
  "FK de %s recusa outra identidade ou recurso ausente",
  async (tipo) => {
    const c = await cenario();
    let mudanca: Partial<Registro>;
    if (tipo === "membro") mudanca = { hostMemberId: crypto.randomUUID() };
    else if (tipo === "sessao") {
      const outro = await novoJogador(),
        sessao = await entrarNoJogo(outro);
      mudanca = { hostSessionId: sessao.sid };
    } else if (tipo === "posse") mudanca = { fence: c.registro.fence + 100 };
    else mudanca = { instanceId: crypto.randomUUID() };
    expect(RESTRICAO).toContain(
      await codigoDoBanco(db.insert(presences).values({ ...c.registro, ...mudanca })),
    );
  },
);

it.each([
  "fim_sem_data",
  "fim_sem_motivo",
  "ativa_com_fim",
  "fim_antes_da_entrada",
  "atualizacao_anterior",
  "ttl_longo",
  "janela_longa",
  "retencao_incorreta",
  "hash_invalido",
] as const)("constraint recusa %s, inclusive campos NULL de encerramento", async (tipo) => {
  const c = await cenario(),
    base = c.agora.getTime();
  let mudanca: Partial<Registro>;
  if (tipo === "fim_sem_data") mudanca = { state: "closed", closeReason: "left", closedAt: null };
  else if (tipo === "fim_sem_motivo")
    mudanca = { state: "closed", closedAt: c.agora, closeReason: null };
  else if (tipo === "ativa_com_fim") mudanca = { closedAt: c.agora };
  else if (tipo === "fim_antes_da_entrada")
    mudanca = { state: "closed", closedAt: new Date(base - 1000), closeReason: "left" };
  else if (tipo === "atualizacao_anterior") mudanca = { updatedAt: new Date(base - 1000) };
  else if (tipo === "ttl_longo") mudanca = { expiresAt: new Date(base + 46_000) };
  else if (tipo === "janela_longa")
    mudanca = {
      validUntil: new Date(base + 25 * 60 * 60_000),
      retainUntil: new Date(base + (25 + 30 * 24) * 60 * 60_000),
    };
  else if (tipo === "retencao_incorreta")
    mudanca = { retainUntil: new Date(base + 32 * 24 * 60 * 60_000) };
  else mudanca = { requestHash: "sem-hash" };
  expect(await codigoDoBanco(db.insert(presences).values({ ...c.registro, ...mudanca }))).toBe(
    CHECAGEM,
  );
});

it("duas entradas concorrentes conservam uma presença ativa por perfil e mundo", async () => {
  const c = await cenario();
  const resultados = await Promise.all([
    codigoDoBanco(db.insert(presences).values(c.registro)),
    codigoDoBanco(db.insert(presences).values({ ...c.registro, clientKey: crypto.randomUUID() })),
  ]);
  expect(resultados.filter((r) => r === undefined)).toHaveLength(1);
  expect(resultados.filter((r) => r === UNICO)).toHaveLength(1);
  expect(await db.select().from(presences).where(eq(presences.spaceId, c.mundoId))).toHaveLength(1);
});

it("nova entrada recebe outra identidade e conserva a prova anterior encerrada", async () => {
  const c = await cenario();
  const [anterior] = await db
    .insert(presences)
    .values({ ...c.registro, state: "closed", closedAt: c.agora, closeReason: "left" })
    .returning();
  const [atual] = await db
    .insert(presences)
    .values({ ...c.registro, clientKey: crypto.randomUUID() })
    .returning();
  expect(anterior?.id).not.toBe(atual?.id);
  expect(
    (await db.select().from(presences).where(eq(presences.spaceId, c.mundoId)))
      .map((p) => p.state)
      .sort(),
  ).toEqual(["active", "closed"]);
});
