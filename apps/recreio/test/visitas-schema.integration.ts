import { AuditPersistenceError } from "@informach/auth";
import { db, eq, sql } from "@informach/db";
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
import { limparPresencasDeAnfitriao } from "@/features/presencas/retencao-repository";
import { limparRecibosDeVisita } from "@/features/visitas/retencao-repository";
import {
  aposentarInstancias,
  CHECAGEM,
  codigoDoBanco,
  eventosCom,
  novoJogador,
  RESTRICAO,
  UNICO,
} from "./apoio";
import { abrirPelaRota, entrarNoJogo, mundoDe, novaInstancia } from "./jogo-apoio";
import { pedir } from "./rotas";
import { familiaSocial } from "./social-apoio";

type Convite = typeof invites.$inferInsert;
type Visita = typeof visits.$inferInsert;

it("expiração auditada é idempotente e não altera membros ou sessões", async () => {
  const c = await cenario(),
    { convite, visita } = await conviteAceito(c),
    [grant] = await db.insert(visits).values(visita).returning();
  if (!grant) throw new Error("Concessão fixture ausente");
  await db.execute(
    sql`update recreio.world_visits set accepted_at=accepted_at-interval '1 hour',updated_at=updated_at-interval '1 hour',expires_at=expires_at-interval '1 hour' where id=${grant.id}`,
  );
  const [pendente] = await db
    .insert(invites)
    .values({
      ...c.convite,
      clientKey: crypto.randomUUID(),
      createdAt: new Date(c.agora.getTime() - 3_600_000),
      expiresAt: new Date(c.agora.getTime() - 3_000_000),
      retainUntil: new Date(c.agora.getTime() + 30 * 86_400_000 - 3_600_000),
    })
    .returning();
  if (!pendente) throw new Error("Convite ausente");
  await limparRecibosDeVisita();
  await limparRecibosDeVisita();
  expect((await db.select().from(visits).where(eq(visits.id, grant.id)))[0]).toMatchObject({
    state: "expired",
    endReason: "expired",
  });
  expect((await db.select().from(invites).where(eq(invites.id, pendente.id)))[0]?.state).toBe(
    "expired",
  );
  expect((await db.select().from(invites).where(eq(invites.id, convite.id)))[0]?.state).toBe(
    "accepted",
  );
  expect(
    (await eventosCom("visitId", grant.id)).filter((e) => e.eventType === "recreio.visit_closed"),
  ).toHaveLength(1);
  expect(
    (await eventosCom("inviteId", pendente.id)).filter(
      (e) => e.eventType === "recreio.visit_invite_closed",
    ),
  ).toHaveLength(1);
  expect(await db.select().from(members).where(eq(members.spaceId, c.mundoId))).toHaveLength(1);
  expect((await abrirPelaRota(c.sessao, c.mundoId)).status).toBe(200);
});

it("auditoria recusada reverte a expiração da concessão", async () => {
  const c = await cenario(),
    { visita } = await conviteAceito(c),
    [grant] = await db.insert(visits).values(visita).returning();
  if (!grant) throw new Error("Concessão ausente");
  await db.execute(
    sql`update recreio.world_visits set accepted_at=accepted_at-interval '1 hour',updated_at=updated_at-interval '1 hour',expires_at=expires_at-interval '1 hour' where id=${grant.id}`,
  );
  await db.execute(
    sql`create function audit.expiracao_visita_teste() returns trigger language plpgsql as $$ begin if new.event_type='recreio.visit_closed' then raise exception 'audit unavailable'; end if; return new; end $$`,
  );
  await db.execute(
    sql`create trigger expiracao_visita_teste before insert on audit.events for each row execute function audit.expiracao_visita_teste()`,
  );
  try {
    await expect(limparRecibosDeVisita()).rejects.toBeInstanceOf(AuditPersistenceError);
  } finally {
    await db.execute(sql`drop trigger expiracao_visita_teste on audit.events`);
    await db.execute(sql`drop function audit.expiracao_visita_teste()`);
  }
  expect((await db.select().from(visits).where(eq(visits.id, grant.id)))[0]).toMatchObject({
    state: "active",
    endedAt: null,
    endReason: null,
  });
  expect(
    (await eventosCom("visitId", grant.id)).filter((e) => e.eventType === "recreio.visit_closed"),
  ).toHaveLength(0);
  await limparRecibosDeVisita();
});

it("retenção em 500+101 remove concessões antes de convites e preserva os atuais", async () => {
  const c = await cenario(),
    { convite, visita } = await conviteAceito(c);
  await db.insert(visits).values(visita);
  const inicio = new Date(c.agora.getTime() - 32 * 86_400_000),
    prazo = new Date(inicio.getTime() + 600_000),
    ids = Array.from({ length: 601 }, () => crypto.randomUUID());
  await db.insert(invites).values(
    ids.map((id) => ({
      ...c.convite,
      id,
      clientKey: crypto.randomUUID(),
      state: "accepted" as const,
      createdAt: inicio,
      expiresAt: prazo,
      finishedAt: inicio,
      retainUntil: new Date(inicio.getTime() + 30 * 86_400_000),
    })),
  );
  await db.insert(visits).values(
    ids.map((id) => ({
      ...visita,
      inviteId: id,
      state: "expired" as const,
      acceptedAt: inicio,
      updatedAt: prazo,
      expiresAt: prazo,
      endedAt: prazo,
      endReason: "expired" as const,
    })),
  );
  expect(await limparRecibosDeVisita()).toMatchObject({
    recibosDeVisitaApagados: 500,
    concessoesDeVisitaApagadas: 500,
  });
  expect(await limparRecibosDeVisita()).toMatchObject({
    recibosDeVisitaApagados: 101,
    concessoesDeVisitaApagadas: 101,
  });
  expect(await limparRecibosDeVisita()).toMatchObject({
    recibosDeVisitaApagados: 0,
    concessoesDeVisitaApagadas: 0,
  });
  expect((await db.select().from(invites).where(eq(invites.id, convite.id)))[0]?.state).toBe(
    "accepted",
  );
  expect((await db.select().from(visits).where(eq(visits.inviteId, convite.id)))[0]?.state).toBe(
    "active",
  );
  expect(await db.select().from(presences).where(eq(presences.id, c.presenca.id))).toHaveLength(1);
});

it("auditoria recusada reverte expurgo de convite e concessão na mesma transação", async () => {
  const c = await cenario(),
    { convite, visita } = await conviteAceito(c);
  await db
    .insert(visits)
    .values({ ...visita, state: "revoked", endedAt: c.agora, endReason: "left" });
  await db.execute(
    sql`update recreio.world_visits set accepted_at=accepted_at-interval '32 days',updated_at=updated_at-interval '32 days',expires_at=expires_at-interval '32 days',ended_at=ended_at-interval '32 days' where invite_id=${convite.id}`,
  );
  await db.execute(
    sql`update recreio.space_visit_invites set created_at=created_at-interval '32 days',expires_at=expires_at-interval '32 days',finished_at=finished_at-interval '32 days',retain_until=retain_until-interval '32 days' where id=${convite.id}`,
  );
  await db.execute(
    sql`create function audit.expurgo_visita_teste() returns trigger language plpgsql as $$ begin if new.event_type='recreio.visit_receipts_purged' then raise exception 'audit unavailable'; end if; return new; end $$`,
  );
  await db.execute(
    sql`create trigger expurgo_visita_teste before insert on audit.events for each row execute function audit.expurgo_visita_teste()`,
  );
  try {
    await expect(limparRecibosDeVisita()).rejects.toBeInstanceOf(AuditPersistenceError);
  } finally {
    await db.execute(sql`drop trigger expurgo_visita_teste on audit.events`);
    await db.execute(sql`drop function audit.expurgo_visita_teste()`);
  }
  expect(await db.select().from(invites).where(eq(invites.id, convite.id))).toHaveLength(1);
  expect(await db.select().from(visits).where(eq(visits.inviteId, convite.id))).toHaveLength(1);
  await limparRecibosDeVisita();
  expect(await db.select().from(invites).where(eq(invites.id, convite.id))).toHaveLength(0);
  expect(await db.select().from(visits).where(eq(visits.inviteId, convite.id))).toHaveLength(0);
});

it("presença antiga referenciada é conservada até a retenção dos convites", async () => {
  const c = await cenario();
  await db.insert(invites).values(c.convite);
  await db.execute(sql`update recreio.world_host_presences set state='closed',close_reason='expired',
    closed_at=expires_at-interval '32 days',created_at=created_at-interval '32 days',updated_at=expires_at-interval '32 days',
    expires_at=expires_at-interval '32 days',valid_until=valid_until-interval '32 days',retain_until=retain_until-interval '32 days' where id=${c.presenca.id}`);
  await limparPresencasDeAnfitriao();
  expect(await db.select().from(presences).where(eq(presences.id, c.presenca.id))).toHaveLength(1);
  expect(
    await db.select().from(invites).where(eq(invites.hostPresenceId, c.presenca.id)),
  ).toHaveLength(1);
});

it("recibo antigo não apaga concessão ainda ativa", async () => {
  const c = await cenario(),
    { convite, visita } = await conviteAceito(c);
  await db.insert(visits).values(visita);
  await db.execute(
    sql`update recreio.space_visit_invites set created_at=created_at-interval '32 days',expires_at=expires_at-interval '32 days',finished_at=finished_at-interval '32 days',retain_until=retain_until-interval '32 days' where id=${convite.id}`,
  );
  await limparRecibosDeVisita();
  expect(await db.select().from(invites).where(eq(invites.id, convite.id))).toHaveLength(1);
  expect((await db.select().from(visits).where(eq(visits.inviteId, convite.id)))[0]?.state).toBe(
    "active",
  );
});

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
