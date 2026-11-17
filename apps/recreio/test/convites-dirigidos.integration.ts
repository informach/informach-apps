import { AuditPersistenceError } from "@informach/auth";
import { and, db, eq, sql } from "@informach/db";
import {
  recreioDirectedInviteWorldApprovals as approvals,
  recreioDirectedSpaceInvites as invites,
  recreioSpaceMembers as members,
  sessions,
  recreioSpaces as spaces,
} from "@informach/db/schema";
import { afterEach, expect, it } from "vitest";
import { administrarMundo } from "@/features/mundos/administracao";
import { limparConvitesDirigidos } from "@/features/mundos/convites-dirigidos-retencao-repository";
import {
  aprovarEntradaNoMundo,
  emitirConviteDirigido,
  responderConviteDirigido,
} from "@/features/mundos/convites-dirigidos-service";
import { sairDoMundo } from "@/features/mundos/saida";
import { aceitarConvite, criarConvite } from "@/features/mundos/service";
import {
  aceitarAmizade,
  emitirCodigoDeAmigo,
  pedirAmizade,
  protegerContato,
  removerAmizade,
} from "@/features/social/service";
import { env } from "@/lib/env";
import { revogar } from "../scripts/concessoes";
import { eventosCom, type Jogador, novoJogador } from "./apoio";
import { mundoDe } from "./jogo-apoio";
import { referenciaSocial as ref } from "./social-apoio";

afterEach(() => {
  env.RECREIO_SOCIAL_MODE = "on";
});
async function nativo(p: Jogador) {
  const [login] = await db.select().from(sessions).where(eq(sessions.id, p.login.authSessionId));
  if (!login) throw new Error("Login ausente");
  return {
    ...ref(p),
    contaId: p.conta.id,
    login: { authSessionId: login.id, criadoEm: login.createdAt, expiraEm: login.expiresAt },
  };
}
async function amizade(a: Jogador, b: Jogador) {
  const codigo = await emitirCodigoDeAmigo(ref(b));
  const pedido = await pedirAmizade(ref(a), {
    codigo: codigo.codigo,
    pedidoId: crypto.randomUUID(),
  });
  await aceitarAmizade(ref(b), pedido.pedidoId);
}
async function cenario() {
  const a = await novoJogador(),
    b = await novoJogador();
  await amizade(a, b);
  const mundoId = await mundoDe(a),
    pedido = {
      mundoId,
      perfilId: b.perfil.id,
      pedidoId: crypto.randomUUID(),
      participacao: "familia",
    };
  return { a, b, mundoId, pedido };
}
const responder = (p: Jogador, id: string, acao: "aceitar" | "recusar" | "revogar" = "aceitar") =>
  responderConviteDirigido(ref(p), { conviteId: id, acao });

it("emissão e aceite guardam um recibo por tentativa, sem repetir participação ou eventos", async () => {
  const c = await cenario(),
    criado = await emitirConviteDirigido(ref(c.a), c.pedido);
  expect(criado).toMatchObject({
    mundoId: c.mundoId,
    estado: "pending",
    aguardaMundo: false,
    aguardaOrigem: false,
    aguardaDestino: false,
  });
  expect(await emitirConviteDirigido(ref(c.a), c.pedido)).toEqual(criado);
  const estranho = await novoJogador();
  await expect(responder(estranho, criado.conviteId)).rejects.toMatchObject({ code: "PEDIDO" });
  await expect(responder(c.a, criado.conviteId)).rejects.toMatchObject({ code: "PEDIDO" });
  const aceito = await responder(c.b, criado.conviteId);
  expect(aceito.estado).toBe("accepted");
  expect(await responder(c.b, criado.conviteId)).toEqual(aceito);
  expect(await emitirConviteDirigido(ref(c.a), c.pedido)).toEqual(aceito);
  expect(
    await db
      .select()
      .from(members)
      .where(and(eq(members.spaceId, c.mundoId), eq(members.profileId, c.b.perfil.id))),
  ).toHaveLength(1);
  const eventos = await eventosCom("inviteId", criado.conviteId);
  expect(eventos.filter((e) => e.eventType === "recreio.space_invite_created")).toHaveLength(1);
  expect(eventos.filter((e) => e.eventType === "recreio.space_invite_accepted")).toHaveLength(1);
  await expect(
    emitirConviteDirigido(ref(c.a), { ...c.pedido, participacao: "outra" }),
  ).rejects.toMatchObject({ code: "CONFLITO" });
});

it("sem amizade ou com identidade e opções excedentes não emite convite", async () => {
  const a = await novoJogador(),
    b = await novoJogador(),
    mundoId = await mundoDe(a);
  const pedido = { mundoId, perfilId: b.perfil.id, pedidoId: crypto.randomUUID() };
  await expect(emitirConviteDirigido(ref(a), pedido)).rejects.toMatchObject({ code: "PEDIDO" });
  await expect(emitirConviteDirigido(ref(a), { ...pedido, atorId: a.conta.id })).rejects.toThrow();
  await expect(emitirConviteDirigido(ref(a), { ...pedido, forma: "visit" })).rejects.toThrow();
  expect(await db.select().from(invites).where(eq(invites.spaceId, mundoId))).toHaveLength(0);
});

it.each(["origem", "destino", "amizade"] as const)(
  "%s revogada antes do aceite não concede participação",
  async (tipo) => {
    const c = await cenario(),
      criado = await emitirConviteDirigido(ref(c.a), c.pedido);
    if (tipo === "amizade") await removerAmizade(ref(c.a), c.b.perfil.id);
    else {
      const p = tipo === "origem" ? c.a : c.b,
        alvo = tipo === "origem" ? c.b : c.a;
      await protegerContato(ref(p), {
        perfilId: alvo.perfil.id,
        bloqueado: true,
        silenciado: true,
      });
    }
    await expect(responder(c.b, criado.conviteId)).rejects.toMatchObject({ code: "PEDIDO" });
    expect(
      await db
        .select()
        .from(members)
        .where(and(eq(members.spaceId, c.mundoId), eq(members.profileId, c.b.perfil.id))),
    ).toHaveLength(0);
    expect(
      (await db.select().from(invites).where(eq(invites.id, criado.conviteId)))[0]?.state,
    ).toBe("pending");
  },
);

it("recusa e revogação funcionam sem cobertura e com novos contatos desligados", async () => {
  const c = await cenario(),
    primeiro = await emitirConviteDirigido(ref(c.a), c.pedido);
  const segundo = await emitirConviteDirigido(ref(c.a), {
    ...c.pedido,
    pedidoId: crypto.randomUUID(),
  });
  await revogar({ email: c.a.conta.email, motivo: "teste_integracao" });
  await revogar({ email: c.b.conta.email, motivo: "teste_integracao" });
  env.RECREIO_SOCIAL_MODE = "off";
  expect((await responder(c.b, primeiro.conviteId, "recusar")).estado).toBe("declined");
  expect((await responder(c.a, segundo.conviteId, "revogar")).estado).toBe("revoked");
  expect((await responder(c.a, segundo.conviteId, "revogar")).estado).toBe("revoked");
  expect(
    (await eventosCom("inviteId", segundo.conviteId)).filter(
      (e) => e.eventType === "recreio.directed_invite_closed",
    ),
  ).toHaveLength(1);
});

it("aceite recuperado depois da saída não restaura participação; novo convite conserva o ID", async () => {
  const c = await cenario(),
    criado = await emitirConviteDirigido(ref(c.a), c.pedido);
  await responder(c.b, criado.conviteId);
  const [antes] = await db
    .select()
    .from(members)
    .where(and(eq(members.spaceId, c.mundoId), eq(members.profileId, c.b.perfil.id)));
  if (!antes) throw new Error("Participação ausente");
  await sairDoMundo(await nativo(c.b), c.mundoId);
  expect((await responder(c.b, criado.conviteId)).estado).toBe("accepted");
  expect((await db.select().from(members).where(eq(members.id, antes.id)))[0]?.state).toBe(
    "former",
  );
  const novo = await emitirConviteDirigido(ref(c.a), {
    ...c.pedido,
    pedidoId: crypto.randomUUID(),
  });
  await responder(c.b, novo.conviteId);
  expect((await db.select().from(members).where(eq(members.id, antes.id)))[0]?.state).toBe(
    "active",
  );
});

it("membro precisa da decisão nativa do mundo para indicar participação alheia", async () => {
  const c = await cenario(),
    anfitriao = await novoJogador(),
    mundoId = await mundoDe(anfitriao);
  const codigo = await criarConvite({ ...ref(anfitriao), jogo: null }, mundoId, {
    forma: "member",
    participacao: "propria",
  });
  await aceitarConvite(ref(c.a), { codigo: codigo.codigo });
  await administrarMundo(await nativo(anfitriao), {
    mundoId,
    versaoDaGestao: 1,
    operacao: "convites",
    membrosConvidam: "yes",
  });
  const pedido = { ...c.pedido, mundoId, participacao: "alheia" },
    criado = await emitirConviteDirigido(ref(c.a), pedido);
  expect(criado.aguardaMundo).toBe(true);
  await expect(responder(c.b, criado.conviteId)).rejects.toMatchObject({ code: "CONFLITO" });
  await expect(
    aprovarEntradaNoMundo(await nativo(c.a), c.a.perfil.id, {
      conviteId: criado.conviteId,
      versaoDaGestao: 2,
      confirmo: true,
    }),
  ).rejects.toMatchObject({ code: "RESPONSAVEL" });
  await aprovarEntradaNoMundo(await nativo(anfitriao), anfitriao.perfil.id, {
    conviteId: criado.conviteId,
    versaoDaGestao: 2,
    confirmo: true,
  });
  expect((await emitirConviteDirigido(ref(c.a), pedido)).aguardaMundo).toBe(false);
  expect((await responder(c.b, criado.conviteId)).estado).toBe("accepted");
});

it("arquivar o mundo revoga convites sem remover progresso ou outros membros", async () => {
  const c = await cenario(),
    criado = await emitirConviteDirigido(ref(c.a), c.pedido);
  await administrarMundo(await nativo(c.a), {
    mundoId: c.mundoId,
    versaoDaGestao: 1,
    operacao: "arquivar",
  });
  expect((await db.select().from(invites).where(eq(invites.id, criado.conviteId)))[0]?.state).toBe(
    "revoked",
  );
  expect((await db.select().from(spaces).where(eq(spaces.id, c.mundoId)))[0]?.status).toBe(
    "archived",
  );
  expect(await db.select().from(members).where(eq(members.spaceId, c.mundoId))).toHaveLength(1);
});

it.each(["auditoria", "prazo"] as const)(
  "%s durante a confirmação reverte membro, recibo e eventos",
  async (tipo) => {
    const c = await cenario(),
      criado = await emitirConviteDirigido(ref(c.a), c.pedido);
    if (tipo === "prazo")
      await db
        .update(invites)
        .set({ expiresAt: new Date(Date.now() + 1100) })
        .where(eq(invites.id, criado.conviteId));
    await db.execute(
      tipo === "auditoria"
        ? sql`create function audit.convite_dirigido_teste() returns trigger language plpgsql as $$ begin if new.event_type='recreio.space_invite_accepted' then raise exception 'audit unavailable'; end if; return new; end $$`
        : sql`create function audit.convite_dirigido_teste() returns trigger language plpgsql as $$ begin if new.event_type='recreio.space_invite_accepted' then perform pg_sleep(1.3); end if; return new; end $$`,
    );
    await db.execute(
      sql`create trigger convite_dirigido_teste before insert on audit.events for each row execute function audit.convite_dirigido_teste()`,
    );
    try {
      const tentativa = responder(c.b, criado.conviteId);
      if (tipo === "auditoria")
        await expect(tentativa).rejects.toBeInstanceOf(AuditPersistenceError);
      else await expect(tentativa).rejects.toMatchObject({ code: "PEDIDO" });
      expect(
        (await db.select().from(invites).where(eq(invites.id, criado.conviteId)))[0]?.state,
      ).toBe("pending");
      expect(
        await db
          .select()
          .from(members)
          .where(and(eq(members.spaceId, c.mundoId), eq(members.profileId, c.b.perfil.id))),
      ).toHaveLength(0);
    } finally {
      await db.execute(sql`drop trigger convite_dirigido_teste on audit.events`);
      await db.execute(sql`drop function audit.convite_dirigido_teste()`);
    }
  },
);

it("expiração e retenção removem aprovações técnicas sem apagar a participação aceita", async () => {
  const c = await cenario(),
    criado = await emitirConviteDirigido(ref(c.a), c.pedido);
  await responder(c.b, criado.conviteId);
  await db.execute(
    sql`update recreio.directed_space_invites set created_at=created_at-interval '31 days',expires_at=expires_at-interval '31 days',finished_at=finished_at-interval '31 days',retain_until=retain_until-interval '31 days' where id=${criado.conviteId}`,
  );
  expect((await limparConvitesDirigidos()).recibosDeConviteDirigidoApagados).toBeGreaterThanOrEqual(
    1,
  );
  expect(await db.select().from(invites).where(eq(invites.id, criado.conviteId))).toHaveLength(0);
  expect(
    await db.select().from(approvals).where(eq(approvals.inviteId, criado.conviteId)),
  ).toHaveLength(0);
  expect(
    (
      await db
        .select()
        .from(members)
        .where(and(eq(members.spaceId, c.mundoId), eq(members.profileId, c.b.perfil.id)))
    )[0]?.state,
  ).toBe("active");
});
