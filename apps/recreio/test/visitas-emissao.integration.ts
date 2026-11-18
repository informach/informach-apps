import { AuditPersistenceError } from "@informach/auth";
import { db, eq, sql } from "@informach/db";
import {
  recreioVisitInviteWorldApprovals as approvals,
  recreioVisitInviteGuardianApprovals as guardianApprovals,
  recreioSpaceVisitInvites as invites,
  recreioSpaceMembers as members,
  recreioWorldHostPresences as presences,
  recreioProfiles as profiles,
  sessions,
  recreioSpaces as spaces,
  recreioWorldVisits as visits,
} from "@informach/db/schema";
import {
  RECIBOS_DE_VISITA_POR_PERFIL_MAX,
  ReciboDeConviteDeVisitaSchema,
} from "@informach/recreio/contrato";
import { afterEach, expect, it, vi } from "vitest";
import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import {
  aceitarAmizade,
  aprovarAmizade,
  emitirCodigoDeAmigo,
  pedirAmizade,
  protegerContato,
} from "@/features/social/service";
import {
  aprovarVisitaDoMenor,
  aprovarVisitaDoMundo,
  emitirConviteDeVisita,
} from "@/features/visitas/service";
import { env } from "@/lib/env";
import { aposentarInstancias, eventosCom, type Jogador, novoJogador } from "./apoio";
import { abrirPelaRota, entrarNoJogo, mundoDe, novaInstancia, OUTRO_JOGO } from "./jogo-apoio";
import { pedir } from "./rotas";
import { familiaSocial, referenciaSocial } from "./social-apoio";

vi.mock("@informach/config/jogos", async (original) => {
  const real = await original<typeof import("@informach/config/jogos")>(),
    jogos = [
      ...real.JOGOS,
      {
        ...real.JOGOS[0],
        id: "jogo-de-teste",
        nome: "Convite de visita interno",
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
  env.RECREIO_SOCIAL_MODE = "on";
});

async function cenario(amigos = true) {
  env.RECREIO_VISITS_MODE = "on";
  env.RECREIO_SOCIAL_MODE = "on";
  await aposentarInstancias();
  const origem = await novoJogador(),
    destino = await novoJogador(),
    autor = referenciaSocial(origem),
    alvo = referenciaSocial(destino);
  if (amigos) {
    const codigo = await emitirCodigoDeAmigo(alvo),
      pedido = await pedirAmizade(autor, { codigo: codigo.codigo, pedidoId: crypto.randomUUID() });
    await aceitarAmizade(alvo, pedido.pedidoId);
  }
  const mundoId = await mundoDe(origem, OUTRO_JOGO),
    sessao = await entrarNoJogo(origem, OUTRO_JOGO, { suportaVisitas: true }),
    instancia = await novaInstancia(OUTRO_JOGO, 10, { suportaVisitas: true });
  expect((await abrirPelaRota(sessao, mundoId)).status).toBe(200);
  const posse = await instancia.cliente.reivindicarPosse(mundoId),
    presenca = await instancia.cliente.atestarPresenca({
      mundoId,
      operacao: "entrar",
      cerca: posse.cerca,
      sid: sessao.sid,
      perfilId: origem.perfil.id,
      chaveDeEntrada: crypto.randomUUID(),
    }),
    pedido = {
      mundoId,
      perfilId: destino.perfil.id,
      presencaId: presenca.presencaId,
      pedidoId: crypto.randomUUID(),
    },
    [prova] = await db.select().from(presences).where(eq(presences.id, presenca.presencaId));
  if (!prova) throw new Error("Presença ausente");
  return {
    origem,
    destino,
    autor,
    alvo,
    mundoId,
    sessao,
    instancia,
    posse,
    presenca,
    prova,
    pedido,
  };
}

async function nativo(p: Jogador): Promise<AutorNativoRecente> {
  const [login] = await db.select().from(sessions).where(eq(sessions.id, p.login.authSessionId));
  if (!login) throw new Error("Login ausente");
  return {
    contaId: p.conta.id,
    sessaoDeAparelhoId: p.ator.sessaoDeAparelhoId,
    login: { authSessionId: login.id, criadoEm: login.createdAt, expiraEm: login.expiresAt },
  };
}
async function versaoDoPerfil(id: string) {
  const [p] = await db.select().from(profiles).where(eq(profiles.id, id));
  if (!p) throw new Error("Perfil ausente");
  return p.policyVersion;
}
async function definirGestor(c: Awaited<ReturnType<typeof cenario>>) {
  const gestor = await novoJogador({ comAcesso: false });
  await db.update(members).set({ role: "member" }).where(eq(members.id, c.prova.hostMemberId));
  await db
    .insert(members)
    .values({ spaceId: c.mundoId, profileId: gestor.perfil.id, role: "steward", state: "active" });
  await db
    .update(spaces)
    .set({ stewardProfileId: gestor.perfil.id, membersInvite: "with_approval" })
    .where(eq(spaces.id, c.mundoId));
  return { gestor, nativo: await nativo(gestor) };
}
async function mundoPendente() {
  const c = await cenario(),
    dono = await definirGestor(c),
    recibo = await emitirConviteDeVisita(c.autor, c.pedido),
    pedido = { conviteId: recibo.conviteId, versaoDaGestao: 1, confirmo: true };
  return { c, dono, recibo, pedido };
}
async function menorConvidado(aguardaMundo = false) {
  const c = await cenario(false),
    familia = await familiaSocial(),
    dono = aguardaMundo ? await definirGestor(c) : null,
    codigo = await emitirCodigoDeAmigo(familia.referencia),
    amizade = await pedirAmizade(c.autor, { codigo: codigo.codigo, pedidoId: crypto.randomUUID() });
  await aprovarAmizade(familia.autor, {
    pedidoId: amizade.pedidoId,
    perfilId: familia.perfil.id,
    versao: await versaoDoPerfil(familia.perfil.id),
  });
  await aceitarAmizade(familia.referencia, amizade.pedidoId);
  const recibo = await emitirConviteDeVisita(c.autor, { ...c.pedido, perfilId: familia.perfil.id }),
    pedido = {
      conviteId: recibo.conviteId,
      perfilId: familia.perfil.id,
      versaoDaPolitica: await versaoDoPerfil(familia.perfil.id),
      confirmo: true,
    };
  return { c, familia, dono, recibo, pedido };
}

it("gestor sem plano aprova visita pendente com login próprio recente e um só evento", async () => {
  const r = await mundoPendente(),
    decidir = () => aprovarVisitaDoMundo(r.dono.nativo, r.dono.gestor.perfil.id, r.pedido);
  expect(await decidir()).toEqual({ confirmado: true });
  expect(await decidir()).toEqual({ confirmado: true });
  expect(
    await db.select().from(approvals).where(eq(approvals.inviteId, r.recibo.conviteId)),
  ).toHaveLength(1);
  expect(
    await db
      .select()
      .from(guardianApprovals)
      .where(eq(guardianApprovals.inviteId, r.recibo.conviteId)),
  ).toHaveLength(0);
  expect(
    (await eventosCom("inviteId", r.recibo.conviteId)).filter(
      (e) => e.eventType === "recreio.visit_invite_world_approved",
    ),
  ).toHaveLength(1);
});

it("destinatário não aprova o mundo e não recebe poder por ter plano", async () => {
  const r = await mundoPendente();
  await expect(
    aprovarVisitaDoMundo(await nativo(r.c.destino), r.c.destino.perfil.id, r.pedido),
  ).rejects.toMatchObject({ code: "RESPONSAVEL" });
});

it.each(["login", "gestao", "anfitriao"] as const)(
  "aprovação do mundo recusa %s antigo ou perdido",
  async (tipo) => {
    const r = await mundoPendente();
    if (tipo === "login")
      await db
        .update(sessions)
        .set({ createdAt: new Date(Date.now() - 11 * 60_000) })
        .where(eq(sessions.id, r.dono.gestor.login.authSessionId));
    if (tipo === "gestao")
      await db.update(spaces).set({ managementRevision: 2 }).where(eq(spaces.id, r.c.mundoId));
    if (tipo === "anfitriao")
      await pedir("POST", "/api/sdk/v1/sessao/sair", { token: r.c.sessao.token });
    const esperado =
      tipo === "login"
        ? { code: "LOGIN_RECENTE" }
        : tipo === "gestao"
          ? { code: "CONFLITO" }
          : { codigo: "SESSAO_ENCERRADA" };
    await expect(
      aprovarVisitaDoMundo(await nativo(r.dono.gestor), r.dono.gestor.perfil.id, r.pedido),
    ).rejects.toMatchObject(esperado);
    expect(
      await db.select().from(approvals).where(eq(approvals.inviteId, r.recibo.conviteId)),
    ).toHaveLength(0);
  },
);

it("responsável sem jogador/plano aprova o menor; decisão do mundo continua independente", async () => {
  const r = await menorConvidado(true);
  if (!r.dono) throw new Error("Gestor ausente");
  expect(
    await db.select().from(profiles).where(eq(profiles.userId, r.familia.conta.id)),
  ).toHaveLength(0);
  expect(await aprovarVisitaDoMenor(r.familia.autor, r.pedido)).toEqual({ confirmado: true });
  expect(await aprovarVisitaDoMenor(r.familia.autor, r.pedido)).toEqual({ confirmado: true });
  expect(
    await db
      .select()
      .from(guardianApprovals)
      .where(eq(guardianApprovals.inviteId, r.recibo.conviteId)),
  ).toHaveLength(1);
  expect(
    await db.select().from(approvals).where(eq(approvals.inviteId, r.recibo.conviteId)),
  ).toHaveLength(0);
  await aprovarVisitaDoMundo(r.dono.nativo, r.dono.gestor.perfil.id, {
    conviteId: r.recibo.conviteId,
    versaoDaGestao: 1,
    confirmo: true,
  });
  expect(
    await db.select().from(approvals).where(eq(approvals.inviteId, r.recibo.conviteId)),
  ).toHaveLength(1);
  expect(
    await db.select().from(visits).where(eq(visits.inviteId, r.recibo.conviteId)),
  ).toHaveLength(0);
  expect(
    (await eventosCom("inviteId", r.recibo.conviteId)).filter(
      (e) => e.eventType === "recreio.visit_invite_guardian_approved",
    ),
  ).toHaveLength(1);
});

it("responsável sem jogador decide pelo mundo do menor sem usar seu aparelho ou plano", async () => {
  const c = await cenario(),
    familia = await familiaSocial();
  await db.update(members).set({ role: "member" }).where(eq(members.id, c.prova.hostMemberId));
  await db
    .insert(members)
    .values({ spaceId: c.mundoId, profileId: familia.perfil.id, role: "steward", state: "active" });
  await db
    .update(spaces)
    .set({ stewardProfileId: familia.perfil.id, membersInvite: "with_approval" })
    .where(eq(spaces.id, c.mundoId));
  const recibo = await emitirConviteDeVisita(c.autor, c.pedido);
  await aprovarVisitaDoMundo(familia.autor, familia.perfil.id, {
    conviteId: recibo.conviteId,
    versaoDaGestao: 1,
    confirmo: true,
  });
  expect(
    (await db.select().from(approvals).where(eq(approvals.inviteId, recibo.conviteId)))[0],
  ).toMatchObject({
    approvedByUserId: familia.conta.id,
    actorKind: "responsavel",
    guardianLinkId: expect.any(String),
    accessGeneration: expect.any(String),
  });
  expect(
    await db.select().from(profiles).where(eq(profiles.userId, familia.conta.id)),
  ).toHaveLength(0);
});

it.each(["outro_adulto", "versao", "sem_confirmacao"] as const)(
  "decisão parental não aceita %s",
  async (tipo) => {
    const r = await menorConvidado();
    const entrada =
        tipo === "versao"
          ? { ...r.pedido, versaoDaPolitica: r.pedido.versaoDaPolitica + 1 }
          : tipo === "sem_confirmacao"
            ? { ...r.pedido, confirmo: false }
            : r.pedido,
      autor = tipo === "outro_adulto" ? await nativo(r.c.origem) : r.familia.autor,
      esperado =
        tipo === "outro_adulto"
          ? { code: "PEDIDO" }
          : tipo === "versao"
            ? { code: "CONFLITO" }
            : { name: "ZodError" };
    await expect(aprovarVisitaDoMenor(autor, entrada)).rejects.toMatchObject(esperado);
    expect(
      await db
        .select()
        .from(guardianApprovals)
        .where(eq(guardianApprovals.inviteId, r.recibo.conviteId)),
    ).toHaveLength(0);
  },
);

it.each(["mundo", "responsavel"] as const)(
  "auditoria recusada reverte aprovação de %s",
  async (tipo) => {
    const mundo = tipo === "mundo" ? await mundoPendente() : null,
      menor = tipo === "responsavel" ? await menorConvidado() : null;
    await db.execute(
      sql`create function audit.aprovacao_visita_teste() returns trigger language plpgsql as $$ begin if new.event_type in ('recreio.visit_invite_world_approved','recreio.visit_invite_guardian_approved') then raise exception 'audit unavailable'; end if; return new; end $$`,
    );
    await db.execute(
      sql`create trigger aprovacao_visita_teste before insert on audit.events for each row execute function audit.aprovacao_visita_teste()`,
    );
    try {
      if (mundo)
        await expect(
          aprovarVisitaDoMundo(mundo.dono.nativo, mundo.dono.gestor.perfil.id, mundo.pedido),
        ).rejects.toBeInstanceOf(AuditPersistenceError);
      if (menor)
        await expect(
          aprovarVisitaDoMenor(menor.familia.autor, menor.pedido),
        ).rejects.toBeInstanceOf(AuditPersistenceError);
    } finally {
      await db.execute(sql`drop trigger aprovacao_visita_teste on audit.events`);
      await db.execute(sql`drop function audit.aprovacao_visita_teste()`);
    }
    if (mundo)
      expect(
        await db.select().from(approvals).where(eq(approvals.inviteId, mundo.recibo.conviteId)),
      ).toHaveLength(0);
    if (menor)
      expect(
        await db
          .select()
          .from(guardianApprovals)
          .where(eq(guardianApprovals.inviteId, menor.recibo.conviteId)),
      ).toHaveLength(0);
  },
);

it("dois envios concorrentes criam um convite auditado, limitado à presença, sem concessão ou membro", async () => {
  const c = await cenario(),
    antes = await db.select().from(members).where(eq(members.spaceId, c.mundoId)),
    [a, b] = await Promise.all([
      emitirConviteDeVisita(c.autor, c.pedido),
      emitirConviteDeVisita(c.autor, c.pedido),
    ]);
  expect(ReciboDeConviteDeVisitaSchema.parse(a)).toEqual(b);
  expect(a.estado).toBe("pending");
  expect(a.expiraEm).toBe(c.prova.validUntil.toISOString());
  expect(await db.select().from(invites).where(eq(invites.spaceId, c.mundoId))).toHaveLength(1);
  expect(await db.select().from(approvals).where(eq(approvals.inviteId, a.conviteId))).toHaveLength(
    1,
  );
  expect(await db.select().from(visits).where(eq(visits.inviteId, a.conviteId))).toHaveLength(0);
  expect(await db.select().from(members).where(eq(members.spaceId, c.mundoId))).toEqual(antes);
  expect(
    (await eventosCom("inviteId", a.conviteId)).filter(
      (e) => e.eventType === "recreio.visit_invite_created",
    ),
  ).toHaveLength(1);
});

it("recupera somente recibo próprio após perda de presença/amigo/cobertura e modos desligados", async () => {
  const c = await cenario(),
    recibo = await emitirConviteDeVisita(c.autor, c.pedido);
  await protegerContato(c.autor, {
    perfilId: c.destino.perfil.id,
    bloqueado: true,
    silenciado: false,
  });
  await pedir("POST", "/api/sdk/v1/sessao/sair", { token: c.sessao.token });
  await c.instancia.cliente.atestarPresenca({
    mundoId: c.mundoId,
    operacao: "sair",
    cerca: c.posse.cerca,
    presencaId: c.presenca.presencaId,
  });
  await db.execute(
    sql`update recreio.entitlements set starts_at=clock_timestamp()-interval '1 hour',ends_at=clock_timestamp()-interval '1 minute' where group_id=(select group_id from recreio.profiles where id=${c.origem.perfil.id})`,
  );
  env.RECREIO_VISITS_MODE = "off";
  env.RECREIO_SOCIAL_MODE = "off";
  expect(await emitirConviteDeVisita(c.autor, c.pedido)).toEqual(recibo);
  expect(Object.keys(recibo).sort()).toEqual([
    "conviteId",
    "criadoEm",
    "estado",
    "expiraEm",
    "jogo",
    "mundoId",
  ]);
});

it.each(["mundoId", "perfilId", "presencaId"] as const)(
  "nonce não recupera corpo divergente em %s",
  async (campo) => {
    const c = await cenario();
    await emitirConviteDeVisita(c.autor, c.pedido);
    await expect(
      emitirConviteDeVisita(c.autor, { ...c.pedido, [campo]: crypto.randomUUID() }),
    ).rejects.toMatchObject({ code: "CONFLITO" });
  },
);

it("pessoa sem amizade atual não recebe convite de visita", async () => {
  const c = await cenario(false);
  await expect(emitirConviteDeVisita(c.autor, c.pedido)).rejects.toMatchObject({ code: "PEDIDO" });
  expect(await db.select().from(invites).where(eq(invites.spaceId, c.mundoId))).toHaveLength(0);
});

it("bloqueio atual impede um convite novo mesmo entre antigos amigos", async () => {
  const c = await cenario();
  await protegerContato(c.alvo, {
    perfilId: c.origem.perfil.id,
    bloqueado: true,
    silenciado: false,
  });
  await expect(emitirConviteDeVisita(c.autor, c.pedido)).rejects.toMatchObject({ code: "PEDIDO" });
});

it("segunda tentativa intencional para a mesma presença exige resolver o pedido pendente", async () => {
  const c = await cenario();
  await emitirConviteDeVisita(c.autor, c.pedido);
  await expect(
    emitirConviteDeVisita(c.autor, { ...c.pedido, pedidoId: crypto.randomUUID() }),
  ).rejects.toMatchObject({ code: "PEDIDO_PENDENTE" });
});

// Fixtures de papel/política: os fluxos reais de gestão e transferência possuem jornadas próprias.
it.each(["no", "with_approval", "yes"] as const)(
  "participante segue a política de convite %s sem precisar participação opaca",
  async (regra) => {
    const c = await cenario(),
      responsavel = await novoJogador();
    await db
      .update(members)
      .set({ role: "member", participation: null })
      .where(eq(members.id, c.prova.hostMemberId));
    await db.insert(members).values({
      spaceId: c.mundoId,
      profileId: responsavel.perfil.id,
      role: "steward",
      state: "active",
    });
    await db
      .update(spaces)
      .set({ stewardProfileId: responsavel.perfil.id, membersInvite: regra })
      .where(eq(spaces.id, c.mundoId));
    if (regra === "no") {
      await expect(emitirConviteDeVisita(c.autor, c.pedido)).rejects.toMatchObject({
        code: "PERMISSAO",
      });
      return;
    }
    const recibo = await emitirConviteDeVisita(c.autor, c.pedido);
    expect(
      await db.select().from(approvals).where(eq(approvals.inviteId, recibo.conviteId)),
    ).toHaveLength(regra === "yes" ? 1 : 0);
  },
);

it.each(["active", "away", "no_access"] as const)(
  "participação permanente %s não vira visita para contornar o vínculo",
  async (estado) => {
    const c = await cenario();
    await db.insert(members).values({
      spaceId: c.mundoId,
      profileId: c.destino.perfil.id,
      role: "member",
      state: estado,
      invitedByMemberId: c.prova.hostMemberId,
    });
    await expect(emitirConviteDeVisita(c.autor, c.pedido)).rejects.toMatchObject({
      codigo: "JA_MEMBRO",
    });
  },
);

it("convidar ex-membro para visitar não restaura a participação antiga", async () => {
  const c = await cenario(),
    [membro] = await db
      .insert(members)
      .values({
        spaceId: c.mundoId,
        profileId: c.destino.perfil.id,
        role: "member",
        state: "former",
        invitedByMemberId: c.prova.hostMemberId,
      })
      .returning();
  if (!membro) throw new Error("Membro fixture ausente");
  expect((await emitirConviteDeVisita(c.autor, c.pedido)).estado).toBe("pending");
  expect((await db.select().from(members).where(eq(members.id, membro.id)))[0]?.state).toBe(
    "former",
  );
});

it.each(["auditoria", "prazo"] as const)(
  "perda de %s reverte convite e decisão automática do mundo",
  async (tipo) => {
    const c = await cenario();
    await db.execute(
      tipo === "auditoria"
        ? sql`create function audit.convite_visita_teste() returns trigger language plpgsql as $$ begin if new.event_type='recreio.visit_invite_created' then raise exception 'audit unavailable'; end if; return new; end $$`
        : sql`create function audit.convite_visita_teste() returns trigger language plpgsql as $$ begin if new.event_type='recreio.visit_invite_created' then perform pg_sleep(1.3); end if; return new; end $$`,
    );
    await db.execute(
      sql`create trigger convite_visita_teste before insert on audit.events for each row execute function audit.convite_visita_teste()`,
    );
    try {
      if (tipo === "prazo")
        await db
          .update(presences)
          .set({ expiresAt: new Date(Date.now() + 1100) })
          .where(eq(presences.id, c.presenca.presencaId));
      if (tipo === "auditoria")
        await expect(emitirConviteDeVisita(c.autor, c.pedido)).rejects.toBeInstanceOf(
          AuditPersistenceError,
        );
      else
        await expect(emitirConviteDeVisita(c.autor, c.pedido)).rejects.toMatchObject({
          code: "PEDIDO",
        });
    } finally {
      await db.execute(sql`drop trigger convite_visita_teste on audit.events`);
      await db.execute(sql`drop function audit.convite_visita_teste()`);
    }
    expect(await db.select().from(invites).where(eq(invites.spaceId, c.mundoId))).toHaveLength(0);
    expect(await db.select().from(approvals).where(eq(approvals.spaceId, c.mundoId))).toHaveLength(
      0,
    );
  },
);

it("entrada rejeita identidade de conta e concessão no corpo", async () => {
  const c = await cenario();
  await expect(
    emitirConviteDeVisita(c.autor, { ...c.pedido, contaId: c.origem.conta.id, estado: "accepted" }),
  ).rejects.toMatchObject({ name: "ZodError" });
});

it("histórico retido é limitado sem apagar recibos para permitir novo envio", async () => {
  const c = await cenario(),
    agora = new Date();
  await db.insert(invites).values(
    Array.from({ length: RECIBOS_DE_VISITA_POR_PERFIL_MAX }, () => ({
      spaceId: c.mundoId,
      hostPresenceId: c.presenca.presencaId,
      hostSessionId: c.sessao.sid,
      hostMemberId: c.prova.hostMemberId,
      originProfileId: c.origem.perfil.id,
      targetProfileId: c.destino.perfil.id,
      clientKey: crypto.randomUUID(),
      requestHash: "d".repeat(64),
      state: "revoked" as const,
      managementRevision: 1,
      friendshipRevision: 1,
      originPolicyVersion: 1,
      targetPolicyVersion: 1,
      createdAt: agora,
      finishedAt: agora,
      expiresAt: new Date(agora.getTime() + 600_000),
      retainUntil: new Date(agora.getTime() + 30 * 86_400_000),
    })),
  );
  await expect(emitirConviteDeVisita(c.autor, c.pedido)).rejects.toMatchObject({
    code: "LIMITE_DE_CONTATOS",
  });
  expect(
    await db.select({ id: invites.id }).from(invites).where(eq(invites.spaceId, c.mundoId)),
  ).toHaveLength(RECIBOS_DE_VISITA_POR_PERFIL_MAX);
});
