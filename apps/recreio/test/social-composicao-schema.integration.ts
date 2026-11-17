import { db, eq } from "@informach/db";
import {
  recreioFriendConsents as consents,
  recreioFriendships as friends,
  recreioGuardianLinks as guardians,
  recreioSocialNotices as notices,
  recreioMinorProtection as protection,
  recreioFriendRequests as requests,
} from "@informach/db/schema";
import { describe, expect, it } from "vitest";
import { aceitarAmizade, emitirCodigoDeAmigo, pedirAmizade } from "@/features/social/service";
import { CHECAGEM, codigoDoBanco, novoJogador } from "./apoio";
import { familiaSocial, referenciaSocial as ref } from "./social-apoio";

describe("banco vincula código, pedido, perfil e relação aceitos", () => {
  it("código de outra pessoa não fundamenta pedido para um destinatário diferente", async () => {
    const a = await novoJogador({ comAcesso: false }),
      b = await novoJogador({ comAcesso: false }),
      c = await novoJogador({ comAcesso: false });
    const codigo = await emitirCodigoDeAmigo(ref(b));
    const agora = new Date();
    expect(
      await codigoDoBanco(
        db.insert(requests).values({
          originProfileId: a.perfil.id,
          targetProfileId: c.perfil.id,
          codeId: codigo.codigoId,
          clientKey: crypto.randomUUID(),
          requestHash: "a".repeat(64),
          createdAt: agora,
          expiresAt: new Date(agora.getTime() + 72 * 60 * 60_000),
        }),
      ),
    ).toBe("23503");
    expect(
      await pedirAmizade(ref(a), { codigo: codigo.codigo, pedidoId: crypto.randomUUID() }),
    ).toMatchObject({ estado: "pending" });
  });
  it("amizade exige pedido aceito exatamente para suas duas pontas", async () => {
    const a = await novoJogador({ comAcesso: false }),
      b = await novoJogador({ comAcesso: false }),
      c = await novoJogador({ comAcesso: false });
    const codigo = await emitirCodigoDeAmigo(ref(b));
    const pedido = await pedirAmizade(ref(a), {
      codigo: codigo.codigo,
      pedidoId: crypto.randomUUID(),
    });
    const [menor, maior] = [a.perfil.id, b.perfil.id].sort();
    if (!menor || !maior) throw new Error("Par ausente");
    expect(
      await codigoDoBanco(
        db
          .insert(friends)
          .values({ lowerProfileId: menor, higherProfileId: maior, requestId: pedido.pedidoId }),
      ),
    ).toBe("23503");
    await aceitarAmizade(ref(b), pedido.pedidoId);
    const [outroMenor, outroMaior] = [a.perfil.id, c.perfil.id].sort();
    if (!outroMenor || !outroMaior) throw new Error("Par ausente");
    expect(
      await codigoDoBanco(
        db.insert(friends).values({
          lowerProfileId: outroMenor,
          higherProfileId: outroMaior,
          requestId: pedido.pedidoId,
        }),
      ),
    ).toBe("23503");
    expect(
      await codigoDoBanco(
        db
          .update(friends)
          .set({ requestState: "accepted", requestId: null })
          .where(eq(friends.requestId, pedido.pedidoId)),
      ),
    ).toBe(CHECAGEM);
  });
  it("aprovação exige vínculo do próprio menor e pertencimento ao pedido", async () => {
    const x = await familiaSocial(),
      y = await familiaSocial();
    const a = await novoJogador({ comAcesso: false }),
      outro = await novoJogador({ comAcesso: false });
    const codigo = await emitirCodigoDeAmigo(x.referencia);
    const pedido = await pedirAmizade(ref(a), {
      codigo: codigo.codigo,
      pedidoId: crypto.randomUUID(),
    });
    const [gx] = await db.select().from(guardians).where(eq(guardians.profileId, x.perfil.id));
    const [gy] = await db.select().from(guardians).where(eq(guardians.profileId, y.perfil.id));
    const [px] = await db.select().from(protection).where(eq(protection.profileId, x.perfil.id));
    const [py] = await db.select().from(protection).where(eq(protection.profileId, y.perfil.id));
    if (!gx || !gy || !px || !py) throw new Error("Proteção ausente");
    const base = {
      requestId: pedido.pedidoId,
      profileId: x.perfil.id,
      guardianLinkId: gx.id,
      approvedByUserId: x.conta.id,
      accessGeneration: px.accessGeneration,
      requestOriginProfileId: a.perfil.id,
      requestTargetProfileId: x.perfil.id,
    };
    expect(
      await codigoDoBanco(db.insert(consents).values({ ...base, guardianLinkId: gy.id })),
    ).toBe("23503");
    expect(
      await codigoDoBanco(
        db.insert(consents).values({
          ...base,
          profileId: y.perfil.id,
          guardianLinkId: gy.id,
          approvedByUserId: y.conta.id,
          accessGeneration: py.accessGeneration,
        }),
      ),
    ).toBe(CHECAGEM);
    expect(
      await codigoDoBanco(
        db.insert(consents).values({ ...base, requestOriginProfileId: outro.perfil.id }),
      ),
    ).toBe("23503");
    await db.insert(consents).values(base);
  });
  it("aviso não pode atribuir a um perfil uma participação que o pedido não tem", async () => {
    const x = await familiaSocial(),
      y = await familiaSocial();
    const a = await novoJogador({ comAcesso: false });
    const agora = new Date();
    const [pedido] = await db
      .insert(requests)
      .values({
        originProfileId: a.perfil.id,
        targetProfileId: x.perfil.id,
        clientKey: crypto.randomUUID(),
        requestHash: "b".repeat(64),
        createdAt: agora,
        expiresAt: new Date(agora.getTime() + 72 * 60 * 60_000),
      })
      .returning();
    if (!pedido) throw new Error("Pedido ausente");
    const base = {
      guardianUserId: x.conta.id,
      profileId: x.perfil.id,
      requestId: pedido.id,
      requestOriginProfileId: a.perfil.id,
      requestTargetProfileId: x.perfil.id,
    };
    expect(
      await codigoDoBanco(db.insert(notices).values({ ...base, profileId: y.perfil.id })),
    ).toBe(CHECAGEM);
    expect(
      await codigoDoBanco(
        db.insert(notices).values({ ...base, requestOriginProfileId: y.perfil.id }),
      ),
    ).toBe("23503");
    await db.insert(notices).values(base);
  });
});
