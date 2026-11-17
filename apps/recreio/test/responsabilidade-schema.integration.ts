import { randomBytes, randomUUID } from "node:crypto";
import { and, db, eq, sql } from "@informach/db";
import {
  recreioGameSessions as games,
  recreioSpaceInvites as invites,
  recreioSpaceMembers as members,
  recreioSpaceStewardshipRequests as requests,
  recreioSpaces as spaces,
} from "@informach/db/schema";
import { describe, expect, it } from "vitest";
import { encerrarSessoesAbertas } from "@/features/sessao-de-jogo/repository";
import { codigoDoBanco, eventosCom, novoJogador } from "./apoio";
import { entrarNoJogo, mundoDe } from "./jogo-apoio";

const inicio = new Date("2026-01-01T00:00:00Z");
const validade = new Date("2026-01-02T00:00:00Z");
const conclusao = new Date("2026-01-01T01:00:00Z");

async function cenario() {
  const dono = await novoJogador();
  const convidado = await novoJogador({ comAcesso: false });
  const mundoId = await mundoDe(dono);
  const [autor] = await db.select().from(members).where(eq(members.spaceId, mundoId));
  if (!autor) throw new Error("Responsável de prova ausente");
  const [destinatario] = await db
    .insert(members)
    .values({
      spaceId: mundoId,
      profileId: convidado.perfil.id,
      role: "member",
      state: "active",
      invitedByMemberId: autor.id,
    })
    .returning();
  if (!destinatario) throw new Error("Destinatário de prova ausente");
  const pedido = {
    id: randomUUID(),
    spaceId: mundoId,
    fromMemberId: autor.id,
    toMemberId: destinatario.id,
    createdAt: inicio,
    expiresAt: validade,
  };
  return { dono, convidado, mundoId, autor, destinatario, pedido };
}

describe("integridade do escopo e preparação da responsabilidade", () => {
  it("recusa autoria de membro e convite vinda de outro mundo", async () => {
    const a = await cenario(),
      b = await cenario();
    const pessoa = await novoJogador();
    expect(
      await codigoDoBanco(
        db.insert(members).values({
          spaceId: a.mundoId,
          profileId: pessoa.perfil.id,
          role: "member",
          state: "active",
          invitedByMemberId: b.autor.id,
        }),
      ),
    ).toBe("23503");
    expect(
      await codigoDoBanco(
        db.insert(invites).values({
          spaceId: a.mundoId,
          invitedByMemberId: b.autor.id,
          form: "member",
          state: "sent",
          codeHash: randomBytes(32).toString("hex"),
          expiresAt: new Date(Date.now() + 60_000),
        }),
      ),
    ).toBe("23503");
    expect(
      await db
        .select()
        .from(members)
        .where(and(eq(members.spaceId, a.mundoId), eq(members.profileId, pessoa.perfil.id))),
    ).toEqual([]);
    expect(await db.select().from(invites).where(eq(invites.spaceId, a.mundoId))).toEqual([]);
  });

  it("recusa solicitante e destinatário de outro mundo", async () => {
    const a = await cenario(),
      b = await cenario();
    expect(
      await codigoDoBanco(db.insert(requests).values({ ...a.pedido, fromMemberId: b.autor.id })),
    ).toBe("23503");
    expect(
      await codigoDoBanco(
        db.insert(requests).values({ ...a.pedido, toMemberId: b.destinatario.id }),
      ),
    ).toBe("23503");
    expect(await db.select().from(requests).where(eq(requests.spaceId, a.mundoId))).toEqual([]);
  });

  it("impede oferta a si próprio e duas ofertas pendentes no mesmo mundo", async () => {
    const a = await cenario();
    expect(
      await codigoDoBanco(db.insert(requests).values({ ...a.pedido, toMemberId: a.autor.id })),
    ).toBe("23514");
    const resultados = await Promise.all(
      [0, 1].map(() =>
        codigoDoBanco(db.insert(requests).values({ ...a.pedido, id: randomUUID() })),
      ),
    );
    expect(resultados.filter((r) => r === undefined)).toHaveLength(1);
    expect(resultados.filter((r) => r === "23505")).toHaveLength(1);
    expect(await db.select().from(requests).where(eq(requests.spaceId, a.mundoId))).toHaveLength(1);
    // A oferta não é um aceite e o schema não altera os papéis passivamente.
    expect(
      (await db.select().from(spaces).where(eq(spaces.id, a.mundoId)))[0]?.stewardProfileId,
    ).toBe(a.dono.perfil.id);
    expect(
      (await db.select().from(members).where(eq(members.id, a.destinatario.id)))[0]?.role,
    ).toBe("member");
  });

  it.each(["accepted", "declined", "revoked", "expired"] as const)(
    "conserva histórico %s e permite uma nova oferta pendente",
    async (state) => {
      const a = await cenario();
      await db
        .insert(requests)
        .values({ ...a.pedido, state, completedAt: state === "expired" ? validade : conclusao });
      await db.insert(requests).values({ ...a.pedido, id: randomUUID() });
      const linhas = await db.select().from(requests).where(eq(requests.spaceId, a.mundoId));
      expect(linhas.map((r) => r.state).sort()).toEqual([state, "pending"].sort());
      expect(linhas.find((r) => r.id === a.pedido.id)?.completedAt).toEqual(
        state === "expired" ? validade : conclusao,
      );
    },
  );

  it.each([
    "pending_concluido",
    "accepted_sem_conclusao",
    "accepted_depois_do_prazo",
    "expired_antes_do_prazo",
    "prazo_anterior_a_criacao",
    "conclusao_anterior_a_criacao",
  ])("recusa estado/prazo incoerente: %s", async (caso) => {
    const a = await cenario();
    const alteracao =
      caso === "pending_concluido"
        ? { state: "pending" as const, completedAt: conclusao }
        : caso === "accepted_sem_conclusao"
          ? { state: "accepted" as const }
          : caso === "accepted_depois_do_prazo"
            ? { state: "accepted" as const, completedAt: validade }
            : caso === "expired_antes_do_prazo"
              ? { state: "expired" as const, completedAt: conclusao }
              : caso === "prazo_anterior_a_criacao"
                ? { expiresAt: inicio }
                : { state: "revoked" as const, completedAt: new Date(inicio.getTime() - 1) };
    expect(await codigoDoBanco(db.insert(requests).values({ ...a.pedido, ...alteracao }))).toBe(
      "23514",
    );
    expect(await db.select().from(requests).where(eq(requests.spaceId, a.mundoId))).toEqual([]);
  });

  it("a autoria histórica continua íntegra quando o membro deixa de ter perfil", async () => {
    const a = await cenario();
    const [convite] = await db
      .insert(invites)
      .values({
        spaceId: a.mundoId,
        invitedByMemberId: a.destinatario.id,
        form: "member",
        state: "accepted",
        codeHash: randomBytes(32).toString("hex"),
        createdAt: inicio,
        expiresAt: validade,
        acceptedAt: conclusao,
        acceptedByProfileId: a.dono.perfil.id,
      })
      .returning();
    if (!convite) throw new Error("Convite histórico de prova ausente");
    await db.insert(requests).values({ ...a.pedido, state: "accepted", completedAt: conclusao });
    await db
      .update(members)
      .set({ state: "former", profileId: null, leftAt: new Date() })
      .where(eq(members.id, a.destinatario.id));
    expect(
      (await db.select().from(invites).where(eq(invites.id, convite.id)))[0]?.invitedByMemberId,
    ).toBe(a.destinatario.id);
    expect(
      (await db.select().from(requests).where(eq(requests.id, a.pedido.id)))[0]?.toMemberId,
    ).toBe(a.destinatario.id);
  });

  it("o encerramento específico conserva cursor/auditoria sem mudar a participação", async () => {
    const a = await cenario();
    const sessao = await entrarNoJogo(a.dono);
    const antes = await db
      .select()
      .from(members)
      .where(eq(members.spaceId, a.mundoId))
      .orderBy(members.id);
    await db.transaction((tx) =>
      encerrarSessoesAbertas(tx, sql`${games.id} = ${sessao.sid}`, "permissions_changed", {
        porQuem: "recreio",
      }),
    );
    const [fim] = await db.select().from(games).where(eq(games.id, sessao.sid));
    expect(fim).toMatchObject({
      endReason: "permissions_changed",
      endedAt: expect.any(Date),
      endedSeq: expect.any(Number),
    });
    expect(
      await db.select().from(members).where(eq(members.spaceId, a.mundoId)).orderBy(members.id),
    ).toEqual(antes);
    expect(await eventosCom("sessionId", sessao.sid)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: "recreio.game_session_ended",
          payload: expect.objectContaining({ reason: "permissions_changed" }),
        }),
      ]),
    );
  });
});
