import { AuditPersistenceError } from "@informach/auth";
import { db, eq, sql } from "@informach/db";
import {
  recreioDirectedInviteGuardianApprovals as guardians,
  recreioDirectedSpaceInvites as invites,
  recreioSpaceMembers as members,
  recreioProfiles as profiles,
  sessions,
} from "@informach/db/schema";
import { afterEach, expect, it, vi } from "vitest";
import { painelDoConviteDoMenor } from "@/features/mundos/convites-dirigidos-painel-repository";
import {
  aprovarConviteDoMenor,
  aprovarEntradaNoMundo,
  emitirConviteDirigido,
  encerrarConviteDoMenor,
  responderConviteDirigido,
} from "@/features/mundos/convites-dirigidos-service";
import { criarMundo } from "@/features/mundos/service";
import {
  aceitarAmizade,
  aprovarAmizade,
  emitirCodigoDeAmigo,
  pedirAmizade,
} from "@/features/social/service";
import { env } from "@/lib/env";
import { conceder, revogar } from "../scripts/concessoes";
import { eventosCom, novoJogador } from "./apoio";
import { familiaSocial, referenciaSocial } from "./social-apoio";

// Título interno independente: não classifica o Morada nem o libera para menores.
vi.mock("@informach/config/jogos", async (original) => {
  const real = await original<typeof import("@informach/config/jogos")>();
  const jogos = [
    ...real.JOGOS,
    {
      ...real.JOGOS[0],
      id: "convites-l",
      nome: "Convites internos",
      rota: "/jogar/convites-l",
      politicasDeMundo: [],
      classificacao: { faixa: "L", descritores: [], interacoes: [] },
    },
  ];
  return {
    ...real,
    JOGOS: jogos,
    jogoPorId: (id: string) => jogos.find((j) => j.id === id) ?? null,
  };
});
type Familia = Awaited<ReturnType<typeof familiaSocial>>;
afterEach(() => {
  env.RECREIO_SOCIAL_MODE = "on";
});
async function versao(perfilId: string) {
  const [p] = await db.select().from(profiles).where(eq(profiles.id, perfilId));
  if (!p) throw new Error("Perfil ausente");
  return p.policyVersion;
}
async function preparar() {
  const a = await familiaSocial(),
    b = await familiaSocial();
  for (const f of [a, b])
    await conceder({ email: f.conta.email, tier: "family", dias: 30, motivo: "teste" });
  const codigo = await emitirCodigoDeAmigo(b.referencia),
    amizade = await pedirAmizade(a.referencia, {
      codigo: codigo.codigo,
      pedidoId: crypto.randomUUID(),
    });
  await aceitarAmizade(b.referencia, amizade.pedidoId);
  for (const f of [a, b])
    await aprovarAmizade(f.autor, {
      pedidoId: amizade.pedidoId,
      perfilId: f.perfil.id,
      versao: await versao(f.perfil.id),
    });
  const mundo = await criarMundo(
    { ...a.referencia, jogo: "convites-l" },
    { nome: "Mundo de teste" },
  );
  const pedido = { mundoId: mundo.id, perfilId: b.perfil.id, pedidoId: crypto.randomUUID() };
  const convite = await emitirConviteDirigido(a.referencia, pedido);
  return { a, b, mundo, pedido, convite };
}
const aceitar = (f: Familia, id: string) =>
  responderConviteDirigido(f.referencia, { conviteId: id, acao: "aceitar" });
const aprovar = async (f: Familia, id: string) =>
  aprovarConviteDoMenor(f.autor, {
    conviteId: id,
    perfilId: f.perfil.id,
    versaoDaPolitica: await versao(f.perfil.id),
    confirmo: true,
  });

it("amizade aprovada e decisão do mundo não substituem o aceite de cada responsável", async () => {
  const c = await preparar();
  expect(c.convite).toMatchObject({
    estado: "pending",
    aguardaMundo: false,
    aguardaOrigem: true,
    aguardaDestino: true,
  });
  await expect(aceitar(c.b, c.convite.conviteId)).rejects.toMatchObject({ code: "CONFLITO" });
  expect(await aprovar(c.a, c.convite.conviteId)).toEqual({ confirmado: true });
  expect(await emitirConviteDirigido(c.a.referencia, c.pedido)).toMatchObject({
    aguardaOrigem: false,
    aguardaDestino: true,
  });
  await expect(aceitar(c.b, c.convite.conviteId)).rejects.toMatchObject({ code: "CONFLITO" });
  await aprovar(c.b, c.convite.conviteId);
  expect((await aceitar(c.b, c.convite.conviteId)).estado).toBe("accepted");
  expect(
    await db.select().from(guardians).where(eq(guardians.inviteId, c.convite.conviteId)),
  ).toHaveLength(2);
  expect(await db.select().from(members).where(eq(members.spaceId, c.mundo.id))).toHaveLength(2);
  const eventos = (await eventosCom("inviteId", c.convite.conviteId)).filter(
    (e) => e.eventType === "recreio.directed_invite_guardian_approved",
  );
  expect(new Set(eventos.map((e) => e.actorId))).toEqual(new Set([c.a.conta.id, c.b.conta.id]));
  expect(await db.select().from(profiles).where(eq(profiles.userId, c.a.conta.id))).toHaveLength(0);
});

it("outro responsável, aparelho pareado e login antigo não podem aprovar", async () => {
  const c = await preparar(),
    perfilId = c.b.perfil.id,
    versaoDaPolitica = await versao(perfilId);
  const pedido = { conviteId: c.convite.conviteId, perfilId, versaoDaPolitica, confirmo: true };
  await expect(aprovarConviteDoMenor(c.a.autor, pedido)).rejects.toMatchObject({ code: "PEDIDO" });
  await expect(
    aprovarConviteDoMenor(
      { ...c.b.autor, sessaoDeAparelhoId: c.b.referencia.sessaoDeAparelhoId },
      pedido,
    ),
  ).rejects.toMatchObject({ code: "AUTH" });
  await expect(
    aprovarConviteDoMenor(
      { ...c.b.autor, login: { ...c.b.autor.login, criadoEm: new Date(Date.now() - 11 * 60000) } },
      pedido,
    ),
  ).rejects.toMatchObject({ code: "LOGIN_RECENTE" });
  expect(
    await db.select().from(guardians).where(eq(guardians.inviteId, c.convite.conviteId)),
  ).toHaveLength(0);
});

it("aprovação recuperada não duplica eventos e versão divergente não altera o recibo", async () => {
  const c = await preparar();
  await aprovar(c.a, c.convite.conviteId);
  await aprovar(c.a, c.convite.conviteId);
  expect(
    (await eventosCom("inviteId", c.convite.conviteId)).filter(
      (e) => e.eventType === "recreio.directed_invite_guardian_approved",
    ),
  ).toHaveLength(1);
  await expect(
    aprovarConviteDoMenor(c.b.autor, {
      conviteId: c.convite.conviteId,
      perfilId: c.b.perfil.id,
      versaoDaPolitica: (await versao(c.b.perfil.id)) + 1,
      confirmo: true,
    }),
  ).rejects.toMatchObject({ code: "CONFLITO" });
  expect(
    await db.select().from(guardians).where(eq(guardians.inviteId, c.convite.conviteId)),
  ).toHaveLength(1);
});

it("a conta responsável pelo destinatário não ganha papel administrativo no mundo", async () => {
  const c = await preparar(),
    adulto = await novoJogador();
  await expect(
    aprovarEntradaNoMundo(c.b.autor, c.b.perfil.id, {
      conviteId: c.convite.conviteId,
      versaoDaGestao: 1,
      confirmo: true,
    }),
  ).rejects.toMatchObject({ code: "RESPONSAVEL" });
  await expect(
    aprovarConviteDoMenor(
      {
        ...c.a.autor,
        contaId: adulto.conta.id,
        sessaoDeAparelhoId: adulto.ator.sessaoDeAparelhoId,
      },
      {
        conviteId: c.convite.conviteId,
        perfilId: c.a.perfil.id,
        versaoDaPolitica: await versao(c.a.perfil.id),
        confirmo: true,
      },
    ),
  ).rejects.toThrow();
  await expect(
    emitirConviteDirigido(referenciaSocial(adulto), { ...c.pedido, perfilId: c.a.perfil.id }),
  ).rejects.toThrow();
});

it("painel nativo lê sem jogador, cobertura ou login recente; aprovação conserva a exigência recente", async () => {
  const c = await preparar(),
    antiga = new Date(Date.now() - 11 * 60000);
  await revogar({ email: c.a.conta.email, motivo: "teste_integracao" });
  await db
    .update(sessions)
    .set({ createdAt: antiga })
    .where(eq(sessions.id, c.a.autor.login.authSessionId));
  const autor = { ...c.a.autor, login: { ...c.a.autor.login, criadoEm: antiga } };
  expect(await painelDoConviteDoMenor(autor, c.a.perfil.id, c.convite.conviteId)).toMatchObject({
    nomeDoMundo: "Mundo de teste",
    aguardaSuaAprovacao: true,
    origem: { apelido: "Protegido" },
    destino: { apelido: "Protegido" },
  });
  await expect(
    aprovarConviteDoMenor(autor, {
      conviteId: c.convite.conviteId,
      perfilId: c.a.perfil.id,
      versaoDaPolitica: await versao(c.a.perfil.id),
      confirmo: true,
    }),
  ).rejects.toMatchObject({ code: "LOGIN_RECENTE" });
  expect(await db.select().from(profiles).where(eq(profiles.userId, c.a.conta.id))).toHaveLength(0);
});

it("painel distingue a própria confirmação da aprovação que cabe ao outro responsável", async () => {
  const c = await preparar();
  await aprovar(c.a, c.convite.conviteId);
  expect(await painelDoConviteDoMenor(c.a.autor, c.a.perfil.id, c.convite.conviteId)).toMatchObject(
    { aguardaSuaAprovacao: false, convite: { aguardaOrigem: false, aguardaDestino: true } },
  );
  expect(await painelDoConviteDoMenor(c.b.autor, c.b.perfil.id, c.convite.conviteId)).toMatchObject(
    { aguardaSuaAprovacao: true },
  );
});

it("responsável encerra gratuitamente com novos contatos desligados e a outra ponta suspensa", async () => {
  const c = await preparar();
  await revogar({ email: c.b.conta.email, motivo: "teste_integracao" });
  await db.update(profiles).set({ status: "suspended" }).where(eq(profiles.id, c.a.perfil.id));
  env.RECREIO_SOCIAL_MODE = "off";
  const pedido = { conviteId: c.convite.conviteId, perfilId: c.b.perfil.id, confirmo: true };
  expect(await encerrarConviteDoMenor(c.b.autor, pedido)).toEqual({ estado: "declined" });
  expect(await encerrarConviteDoMenor(c.b.autor, pedido)).toEqual({ estado: "declined" });
  const eventos = (await eventosCom("inviteId", c.convite.conviteId)).filter(
    (e) => e.eventType === "recreio.directed_invite_closed",
  );
  expect(eventos).toHaveLength(1);
  expect(eventos[0]).toMatchObject({
    actorId: c.b.conta.id,
    payload: { profileId: c.b.perfil.id, actorKind: "responsavel" },
  });
});

it("encerramento parental recusa outro responsável e não apaga participação já aceita", async () => {
  const c = await preparar(),
    pedido = { conviteId: c.convite.conviteId, perfilId: c.b.perfil.id, confirmo: true };
  await expect(encerrarConviteDoMenor(c.a.autor, pedido)).rejects.toMatchObject({ code: "PEDIDO" });
  await aprovar(c.a, c.convite.conviteId);
  await aprovar(c.b, c.convite.conviteId);
  await aceitar(c.b, c.convite.conviteId);
  expect(await encerrarConviteDoMenor(c.b.autor, pedido)).toEqual({ estado: "accepted" });
  expect(await db.select().from(members).where(eq(members.spaceId, c.mundo.id))).toHaveLength(2);
  expect(
    (await eventosCom("inviteId", c.convite.conviteId)).filter(
      (e) => e.eventType === "recreio.directed_invite_closed",
    ),
  ).toHaveLength(0);
});

it("falha real da auditoria reverte o encerramento parental", async () => {
  const c = await preparar();
  await db.execute(
    sql`create function audit.convite_responsavel_teste() returns trigger language plpgsql as $$ begin if new.event_type='recreio.directed_invite_closed' then raise exception 'audit unavailable'; end if; return new; end $$`,
  );
  await db.execute(
    sql`create trigger convite_responsavel_teste before insert on audit.events for each row execute function audit.convite_responsavel_teste()`,
  );
  try {
    await expect(
      encerrarConviteDoMenor(c.b.autor, {
        conviteId: c.convite.conviteId,
        perfilId: c.b.perfil.id,
        confirmo: true,
      }),
    ).rejects.toBeInstanceOf(AuditPersistenceError);
    expect(
      (await db.select().from(invites).where(eq(invites.id, c.convite.conviteId)))[0]?.state,
    ).toBe("pending");
  } finally {
    await db.execute(sql`drop trigger convite_responsavel_teste on audit.events`);
    await db.execute(sql`drop function audit.convite_responsavel_teste()`);
  }
});
