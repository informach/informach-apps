import { db, eq } from "@informach/db";
import {
  recreioSocialBlocks as blocks,
  recreioFriendCodes as codes,
  recreioFriendships as friends,
  recreioFriendRequests as requests,
} from "@informach/db/schema";
import { describe, expect, it } from "vitest";
import { CHECAGEM, codigoDoBanco, novoJogador, UNICO } from "./apoio";

async function preparar() {
  const a = await novoJogador({ comAcesso: false });
  const b = await novoJogador({ comAcesso: false });
  const criadoEm = new Date();
  const [codigo] = await db
    .insert(codes)
    .values({
      profileId: b.perfil.id,
      codeHash: crypto.randomUUID().replaceAll("-", "").repeat(2),
      createdAt: criadoEm,
      expiresAt: new Date(criadoEm.getTime() + 30 * 60_000),
    })
    .returning();
  if (!codigo) throw new Error("Código ausente");
  const pedido = {
    originProfileId: a.perfil.id,
    targetProfileId: b.perfil.id,
    codeId: codigo.id,
    clientKey: crypto.randomUUID(),
    requestHash: "b".repeat(64),
    createdAt: criadoEm,
    expiresAt: new Date(criadoEm.getTime() + 72 * 60 * 60_000),
  };
  return { a, b, codigo, pedido };
}

describe("integridade dos fatos sociais", () => {
  it("código guarda hash, tem prazo limitado e não admite duas emissões abertas", async () => {
    const r = await preparar();
    const base = {
      profileId: r.b.perfil.id,
      createdAt: r.codigo.createdAt,
      expiresAt: r.codigo.expiresAt,
      codeHash: "c".repeat(64),
    };
    expect(
      await codigoDoBanco(db.insert(codes).values({ ...base, codeHash: "CODIGO-PRIVADO" })),
    ).toBe(CHECAGEM);
    expect(
      await codigoDoBanco(
        db
          .insert(codes)
          .values({ ...base, expiresAt: new Date(base.createdAt.getTime() + 31 * 60_000) }),
      ),
    ).toBe(CHECAGEM);
    expect(await codigoDoBanco(db.insert(codes).values(base))).toBe(UNICO);
    expect(
      await codigoDoBanco(
        db
          .update(codes)
          .set({ consumedAt: new Date(base.expiresAt.getTime() + 1) })
          .where(eq(codes.id, r.codigo.id)),
      ),
    ).toBe(CHECAGEM);
    await db.update(codes).set({ revokedAt: new Date() }).where(eq(codes.id, r.codigo.id));
    await db.insert(codes).values(base);
  });
  it("pedido não aponta para si e o par pendente é único em ambas as direções", async () => {
    const r = await preparar();
    expect(
      await codigoDoBanco(
        db.insert(requests).values({ ...r.pedido, targetProfileId: r.a.perfil.id }),
      ),
    ).toBe(CHECAGEM);
    await db.insert(requests).values(r.pedido);
    expect(
      await codigoDoBanco(
        db.insert(requests).values({
          ...r.pedido,
          codeId: null,
          clientKey: crypto.randomUUID(),
          originProfileId: r.b.perfil.id,
          targetProfileId: r.a.perfil.id,
        }),
      ),
    ).toBe(UNICO);
    expect(
      await codigoDoBanco(
        db
          .insert(requests)
          .values({ ...r.pedido, state: "expired", finishedAt: r.pedido.createdAt }),
      ),
    ).toBe(CHECAGEM);
  });
  it("amizade ativa exige aceite explícito e não perde esse fato por limpeza de recibo", async () => {
    const r = await preparar();
    expect(
      await codigoDoBanco(
        db
          .insert(requests)
          .values({ ...r.pedido, state: "accepted", finishedAt: r.pedido.createdAt }),
      ),
    ).toBe(CHECAGEM);
    const [pedido] = await db
      .insert(requests)
      .values({
        ...r.pedido,
        state: "accepted",
        targetAcceptedAt: r.pedido.createdAt,
        finishedAt: r.pedido.createdAt,
      })
      .returning();
    if (!pedido) throw new Error("Pedido ausente");
    const [menor, maior] = [r.a.perfil.id, r.b.perfil.id].sort();
    if (!menor || !maior) throw new Error("Par ausente");
    expect(
      await codigoDoBanco(
        db
          .insert(friends)
          .values({ lowerProfileId: maior, higherProfileId: menor, requestId: pedido.id }),
      ),
    ).toBe(CHECAGEM);
    await db
      .insert(friends)
      .values({ lowerProfileId: menor, higherProfileId: maior, requestId: pedido.id });
    expect(await codigoDoBanco(db.delete(requests).where(eq(requests.id, pedido.id)))).toBe(
      CHECAGEM,
    );
    expect(
      (await db.select().from(friends).where(eq(friends.requestId, pedido.id)))[0],
    ).toMatchObject({ state: "active", requestId: pedido.id });
  });
  it("bloqueio não é criado para si nem por ausência de proteção; silêncio é independente", async () => {
    const r = await preparar();
    expect(
      await codigoDoBanco(
        db
          .insert(blocks)
          .values({ actorProfileId: r.a.perfil.id, targetProfileId: r.a.perfil.id, blocked: true }),
      ),
    ).toBe(CHECAGEM);
    expect(
      await codigoDoBanco(
        db.insert(blocks).values({ actorProfileId: r.a.perfil.id, targetProfileId: r.b.perfil.id }),
      ),
    ).toBe(CHECAGEM);
    await db.insert(blocks).values({
      actorProfileId: r.a.perfil.id,
      targetProfileId: r.b.perfil.id,
      blocked: false,
      muted: true,
    });
    expect(
      (await db.select().from(blocks).where(eq(blocks.actorProfileId, r.a.perfil.id)))[0],
    ).toMatchObject({ blocked: false, muted: true });
  });
});
