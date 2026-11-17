import { db, eq } from "@informach/db";
import {
  recreioDirectedInviteGuardianApprovals as guardians,
  recreioSpaceMembers as members,
  recreioProfiles as profiles,
} from "@informach/db/schema";
import { expect, it, vi } from "vitest";
import {
  aprovarConviteDoMenor,
  aprovarEntradaNoMundo,
  emitirConviteDirigido,
  responderConviteDirigido,
} from "@/features/mundos/convites-dirigidos-service";
import { criarMundo } from "@/features/mundos/service";
import {
  aceitarAmizade,
  aprovarAmizade,
  emitirCodigoDeAmigo,
  pedirAmizade,
} from "@/features/social/service";
import { conceder } from "../scripts/concessoes";
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
