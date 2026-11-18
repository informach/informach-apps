import { db, eq } from "@informach/db";
import {
  recreioVisitInviteWorldApprovals as approvals,
  recreioVisitInviteGuardianApprovals as guardianApprovals,
  recreioGuardianLinks as guardians,
  recreioSpaceVisitInvites as invites,
  recreioSpaceMembers as members,
  recreioWorldHostPresences as presences,
  recreioMinorProtection as protections,
  recreioWorldVisits as visits,
} from "@informach/db/schema";
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
import { pedir } from "./rotas";
import { familiaSocial } from "./social-apoio";

type Convite = typeof invites.$inferInsert;
type Visita = typeof visits.$inferInsert;

it("aprovação parental só referencia ponta do convite e vínculo do próprio perfil", async () => {
  const c = await cenario(),
    familia = await familiaSocial(),
    [convite] = await db
      .insert(invites)
      .values({ ...c.convite, targetProfileId: familia.perfil.id })
      .returning(),
    [vinculo] = await db.select().from(guardians).where(eq(guardians.profileId, familia.perfil.id)),
    [menor] = await db
      .select()
      .from(protections)
      .where(eq(protections.profileId, familia.perfil.id));
  if (!convite || !vinculo || !menor) throw new Error("Fixture parental ausente");
  const base: typeof guardianApprovals.$inferInsert = {
    inviteId: convite.id,
    originProfileId: c.origem.perfil.id,
    targetProfileId: familia.perfil.id,
    profileId: familia.perfil.id,
    guardianLinkId: vinculo.id,
    approvedByUserId: familia.conta.id,
    accessGeneration: menor.accessGeneration,
    policyVersion: 1,
  };
  expect(RESTRICAO).toContain(
    await codigoDoBanco(
      db.insert(guardianApprovals).values({ ...base, profileId: c.origem.perfil.id }),
    ),
  );
  const outro = await familiaSocial(),
    [outroVinculo] = await db
      .select()
      .from(guardians)
      .where(eq(guardians.profileId, outro.perfil.id));
  if (!outroVinculo) throw new Error("Outro vínculo ausente");
  expect(
    await codigoDoBanco(
      db
        .insert(guardianApprovals)
        .values({ ...base, profileId: outro.perfil.id, guardianLinkId: outroVinculo.id }),
    ),
  ).toBe(CHECAGEM);
  expect(await codigoDoBanco(db.insert(guardianApprovals).values(base))).toBeUndefined();
});

/** Fixtures de integridade: SQL direto não representa convite/aceite nem admissão de visitante. */
async function cenario() {
  await aposentarInstancias();
  const origem = await novoJogador(),
    destino = await novoJogador(),
    mundoId = await mundoDe(origem),
    sessao = await entrarNoJogo(origem),
    instancia = await novaInstancia();
  expect((await abrirPelaRota(sessao, mundoId)).status).toBe(200);
  const posse = await instancia.cliente.reivindicarPosse(mundoId),
    membro = await instancia.cliente.verificarEntrada({
      mundoId,
      cerca: posse.cerca,
      sid: sessao.sid,
      perfilId: origem.perfil.id,
    }),
    agora = new Date(),
    inicio = agora.getTime(),
    [presenca] = await db
      .insert(presences)
      .values({
        spaceId: mundoId,
        hostProfileId: origem.perfil.id,
        hostSessionId: sessao.sid,
        hostMemberId: membro.membroId,
        instanceId: instancia.instanciaId,
        fence: posse.cerca,
        clientKey: crypto.randomUUID(),
        requestHash: "a".repeat(64),
        createdAt: agora,
        updatedAt: agora,
        expiresAt: new Date(inicio + 30_000),
        validUntil: new Date(inicio + 86_400_000),
        retainUntil: new Date(inicio + 31 * 86_400_000),
      })
      .returning();
  if (!presenca) throw new Error("Presença fixture ausente");
  const convite: Convite = {
    spaceId: mundoId,
    hostPresenceId: presenca.id,
    hostSessionId: sessao.sid,
    hostMemberId: membro.membroId,
    originProfileId: origem.perfil.id,
    targetProfileId: destino.perfil.id,
    clientKey: crypto.randomUUID(),
    requestHash: "b".repeat(64),
    managementRevision: 1,
    friendshipRevision: 1,
    originPolicyVersion: 1,
    targetPolicyVersion: 1,
    createdAt: agora,
    expiresAt: new Date(inicio + 600_000),
    retainUntil: new Date(inicio + 30 * 86_400_000),
  };
  return { origem, destino, mundoId, sessao, instancia, posse, membro, presenca, agora, convite };
}
async function conviteAceito(c: Awaited<ReturnType<typeof cenario>>) {
  const [convite] = await db
    .insert(invites)
    .values({ ...c.convite, state: "accepted", finishedAt: c.agora })
    .returning();
  if (!convite) throw new Error("Convite fixture ausente");
  const visita: Visita = {
    inviteId: convite.id,
    spaceId: c.mundoId,
    visitorProfileId: c.destino.perfil.id,
    hostPresenceId: c.presenca.id,
    acceptedAt: c.agora,
    updatedAt: c.agora,
    expiresAt: convite.expiresAt,
  };
  return { convite, visita };
}

it("concessão separada conserva membros e UUID de visita não é convite permanente nem entrada de membro", async () => {
  const c = await cenario(),
    { convite, visita } = await conviteAceito(c),
    antes = await db.select().from(members).where(eq(members.spaceId, c.mundoId));
  await db.insert(visits).values(visita);
  const sessao = await entrarNoJogo(c.destino);
  expect((await abrirPelaRota(sessao, c.mundoId)).status).toBe(403);
  await expect(
    c.instancia.cliente.verificarEntrada({
      mundoId: c.mundoId,
      cerca: c.posse.cerca,
      sid: sessao.sid,
      perfilId: c.destino.perfil.id,
    }),
  ).rejects.toMatchObject({ codigo: "NAO_MEMBRO" });
  expect(
    await pedir("POST", "/api/sdk/v1/convites-dirigidos", {
      token: sessao.token,
      corpo: { operacao: "responder", conviteId: convite.id, acao: "aceitar" },
    }),
  ).toMatchObject({ status: 404, corpo: { codigo: "NAO_ENCONTRADO" } });
  expect(await db.select().from(members).where(eq(members.spaceId, c.mundoId))).toEqual(antes);
});

it.each(["mundo", "perfil", "sid", "membro"] as const)(
  "convite recusa %s diferente da presença original",
  async (tipo) => {
    const c = await cenario();
    const mudanca: Partial<Convite> =
      tipo === "mundo"
        ? { spaceId: crypto.randomUUID() }
        : tipo === "perfil"
          ? { originProfileId: c.destino.perfil.id, targetProfileId: c.origem.perfil.id }
          : tipo === "sid"
            ? { hostSessionId: (await entrarNoJogo(c.destino)).sid }
            : { hostMemberId: crypto.randomUUID() };
    expect(RESTRICAO).toContain(
      await codigoDoBanco(db.insert(invites).values({ ...c.convite, ...mudanca })),
    );
  },
);

it("nonce e pedido pendente não duplicam; nova identidade só após decisão terminal", async () => {
  const c = await cenario(),
    [convite] = await db.insert(invites).values(c.convite).returning();
  if (!convite) throw new Error("Convite ausente");
  expect(await codigoDoBanco(db.insert(invites).values(c.convite))).toBe(UNICO);
  expect(
    await codigoDoBanco(
      db.insert(invites).values({ ...c.convite, clientKey: crypto.randomUUID() }),
    ),
  ).toBe(UNICO);
  await db
    .update(invites)
    .set({ state: "revoked", finishedAt: c.agora })
    .where(eq(invites.id, convite.id));
  expect(
    await codigoDoBanco(
      db.insert(invites).values({ ...c.convite, clientKey: crypto.randomUUID() }),
    ),
  ).toBeUndefined();
});

it.each(["sem_data", "aceite_tardio", "retencao", "prazo", "hash"] as const)(
  "convite recusa %s",
  async (tipo) => {
    const c = await cenario();
    const mudanca: Partial<Convite> =
      tipo === "sem_data"
        ? { state: "accepted", finishedAt: null }
        : tipo === "aceite_tardio"
          ? { state: "accepted", finishedAt: c.convite.expiresAt }
          : tipo === "retencao"
            ? { retainUntil: new Date(c.agora.getTime() + 29 * 86_400_000) }
            : tipo === "prazo"
              ? { expiresAt: new Date(c.agora.getTime() + 25 * 3_600_000) }
              : { requestHash: "nao-e-sha" };
    expect(await codigoDoBanco(db.insert(invites).values({ ...c.convite, ...mudanca }))).toBe(
      CHECAGEM,
    );
  },
);

it.each(["destinatario", "presenca", "mundo"] as const)(
  "concessão recusa %s diferente do convite",
  async (tipo) => {
    const c = await cenario(),
      { visita } = await conviteAceito(c),
      mudanca: Partial<Visita> =
        tipo === "destinatario"
          ? { visitorProfileId: c.origem.perfil.id }
          : tipo === "presenca"
            ? { hostPresenceId: crypto.randomUUID() }
            : { spaceId: crypto.randomUUID() };
    expect(RESTRICAO).toContain(
      await codigoDoBanco(db.insert(visits).values({ ...visita, ...mudanca })),
    );
  },
);

it.each(["sem_data", "sem_motivo", "expirada_antes", "prazo", "atualizacao"] as const)(
  "concessão recusa %s, inclusive encerramento NULL",
  async (tipo) => {
    const c = await cenario(),
      { visita } = await conviteAceito(c),
      mudanca: Partial<Visita> =
        tipo === "sem_data"
          ? { state: "revoked", endReason: "left", endedAt: null }
          : tipo === "sem_motivo"
            ? { state: "revoked", endedAt: c.agora, endReason: null }
            : tipo === "expirada_antes"
              ? { state: "expired", endedAt: c.agora, endReason: "expired" }
              : tipo === "prazo"
                ? { expiresAt: new Date(c.agora.getTime() + 25 * 3_600_000) }
                : { updatedAt: new Date(c.agora.getTime() - 1) };
    expect(await codigoDoBanco(db.insert(visits).values({ ...visita, ...mudanca }))).toBe(CHECAGEM);
  },
);

it("uma concessão por convite e por visitante/mundo ativo; retenção respeita dependências", async () => {
  const c = await cenario(),
    { convite, visita } = await conviteAceito(c);
  await db.insert(visits).values(visita);
  expect(await codigoDoBanco(db.insert(visits).values(visita))).toBe(UNICO);
  const [outro] = await db
    .insert(invites)
    .values({
      ...c.convite,
      clientKey: crypto.randomUUID(),
      state: "accepted",
      finishedAt: c.agora,
    })
    .returning();
  if (!outro) throw new Error("Convite ausente");
  expect(await codigoDoBanco(db.insert(visits).values({ ...visita, inviteId: outro.id }))).toBe(
    UNICO,
  );
  expect(RESTRICAO).toContain(
    await codigoDoBanco(db.delete(invites).where(eq(invites.id, convite.id))),
  );
  expect(RESTRICAO).toContain(
    await codigoDoBanco(db.delete(presences).where(eq(presences.id, c.presenca.id))),
  );
  await db.delete(visits).where(eq(visits.inviteId, convite.id));
  await db.delete(invites).where(eq(invites.spaceId, c.mundoId));
  expect(
    await codigoDoBanco(db.delete(presences).where(eq(presences.id, c.presenca.id))),
  ).toBeUndefined();
});

it("decisão do mundo exige membro do mesmo mundo e não fabrica prova parental", async () => {
  const c = await cenario(),
    { convite } = await conviteAceito(c),
    base: typeof approvals.$inferInsert = {
      inviteId: convite.id,
      spaceId: c.mundoId,
      approvedByMemberId: c.membro.membroId,
      approvedByUserId: c.origem.conta.id,
      actorKind: "jogador",
      managementRevision: 1,
    };
  expect(RESTRICAO).toContain(
    await codigoDoBanco(
      db.insert(approvals).values({ ...base, approvedByMemberId: crypto.randomUUID() }),
    ),
  );
  expect(
    await codigoDoBanco(db.insert(approvals).values({ ...base, actorKind: "responsavel" })),
  ).toBe(CHECAGEM);
  expect(await codigoDoBanco(db.insert(approvals).values(base))).toBeUndefined();
});
