import { AuditPersistenceError } from "@informach/auth";
import { db, eq, sql } from "@informach/db";
import {
  recreioVisitInviteWorldApprovals as approvals,
  recreioSpaceVisitInvites as invites,
  recreioSpaceMembers as members,
  recreioWorldHostPresences as presences,
  recreioSpaces as spaces,
  recreioWorldVisits as visits,
} from "@informach/db/schema";
import {
  RECIBOS_DE_VISITA_POR_PERFIL_MAX,
  ReciboDeConviteDeVisitaSchema,
} from "@informach/recreio/contrato";
import { afterEach, expect, it, vi } from "vitest";
import {
  aceitarAmizade,
  emitirCodigoDeAmigo,
  pedirAmizade,
  protegerContato,
} from "@/features/social/service";
import { emitirConviteDeVisita } from "@/features/visitas/service";
import { env } from "@/lib/env";
import { aposentarInstancias, eventosCom, novoJogador } from "./apoio";
import { abrirPelaRota, entrarNoJogo, mundoDe, novaInstancia, OUTRO_JOGO } from "./jogo-apoio";
import { pedir } from "./rotas";
import { referenciaSocial } from "./social-apoio";

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
