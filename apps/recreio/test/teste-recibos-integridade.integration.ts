import { randomUUID } from "node:crypto";
import { db, eq } from "@informach/db";
import {
  recreioTrialClaims as claims,
  recreioTrialEnrollments as enrollments,
  recreioEntitlements as grants,
  recreioGroups as groups,
  recreioProfiles as profiles,
} from "@informach/db/schema";
import { describe, expect, it } from "vitest";
import { codigoDoPostgres } from "@/lib/repository";
import { novaConta } from "./apoio";

const HORAS_48 = 48 * 60 * 60 * 1000;
const VERSAO = "teste-2026-11-18-v1";

/** Fixtures SQL de integridade; não comprovam consentimento nativo ou início por SID. */
async function preparar() {
  const conta = await novaConta();
  const [grupo] = await db.insert(groups).values({ ownerUserId: conta.id }).returning();
  if (!grupo) throw new Error("Grupo de fixture ausente");
  const startsAt = new Date();
  const endsAt = new Date(startsAt.getTime() + HORAS_48);
  const [aceite] = await db
    .insert(enrollments)
    .values({
      payerUserId: conta.id,
      groupId: grupo.id,
      policyVersion: VERSAO,
      adultDeclarationVersion: "adulto-2026-11-17",
      acceptedAt: startsAt,
    })
    .returning();
  const [grant] = await db
    .insert(grants)
    .values({
      groupId: grupo.id,
      kind: "trial",
      tier: "family",
      startsAt,
      endsAt,
      reasonCode: "fixture_teste",
    })
    .returning();
  if (!aceite || !grant) throw new Error("Recibos de fixture ausentes");
  const pedido = {
    payerUserId: conta.id,
    groupId: grupo.id,
    enrollmentId: aceite.id,
    entitlementId: grant.id,
    cohort: "48h" as const,
    policyVersion: VERSAO,
    startsAt,
    endsAt,
  };
  return { conta, grupo, aceite, grant, pedido };
}

async function recusa(consulta: PromiseLike<unknown>, codigo: string) {
  const erro = await Promise.resolve(consulta).then(
    () => null,
    (falha: unknown) => falha,
  );
  expect(codigoDoPostgres(erro)).toBe(codigo);
}

describe("integridade SQL do experimento sem cartão", () => {
  it("conserva recibo de quatro perfis sem criar jogador para o pagante", async () => {
    const p = await preparar();
    await db.insert(claims).values(p.pedido);
    expect(await db.select().from(profiles).where(eq(profiles.groupId, p.grupo.id))).toEqual([]);
    const [recibo] = await db.select().from(claims).where(eq(claims.payerUserId, p.conta.id));
    expect(recibo).toMatchObject({
      ...p.pedido,
      entitlementKind: "trial",
      entitlementTier: "family",
    });
  });

  it("não permite dois consentimentos ativos para a mesma conta", async () => {
    const p = await preparar();
    await recusa(
      db.insert(enrollments).values({
        payerUserId: p.conta.id,
        groupId: p.grupo.id,
        policyVersion: VERSAO,
        adultDeclarationVersion: "adulto-2026-11-17",
        acceptedAt: new Date(),
      }),
      "23505",
    );
  });

  it("retirar consentimento não apaga a marca de teste já usado", async () => {
    const p = await preparar();
    await db.insert(claims).values(p.pedido);
    const retirada = new Date(p.aceite.acceptedAt.getTime() + 1000);
    await db
      .update(enrollments)
      .set({ withdrawnAt: retirada })
      .where(eq(enrollments.id, p.aceite.id));
    const [outro] = await db
      .insert(enrollments)
      .values({
        payerUserId: p.conta.id,
        groupId: p.grupo.id,
        policyVersion: VERSAO,
        adultDeclarationVersion: "adulto-2026-11-17",
        acceptedAt: retirada,
      })
      .returning();
    if (!outro) throw new Error("Consentimento novo ausente");
    await recusa(db.insert(claims).values({ ...p.pedido, enrollmentId: outro.id }), "23505");
    expect(await db.select().from(claims).where(eq(claims.payerUserId, p.conta.id))).toHaveLength(
      1,
    );
  });

  it("o aceite não pode declarar pagante de outro grupo", async () => {
    const p = await preparar(),
      outro = await preparar();
    await recusa(
      db.insert(enrollments).values({
        payerUserId: outro.conta.id,
        groupId: p.grupo.id,
        policyVersion: VERSAO,
        adultDeclarationVersion: "adulto-2026-11-17",
        acceptedAt: new Date(),
        withdrawnAt: new Date(),
      }),
      "23503",
    );
  });

  it("o recibo não pode usar consentimento de outro pagante/grupo", async () => {
    const p = await preparar(),
      outro = await preparar();
    await recusa(db.insert(claims).values({ ...p.pedido, enrollmentId: outro.aceite.id }), "23503");
  });

  it("o recibo exige a versão de política efetivamente aceita", async () => {
    const p = await preparar();
    await recusa(db.insert(claims).values({ ...p.pedido, policyVersion: "outra_versao" }), "23503");
  });

  it("o recibo não toma a concessão de outro grupo", async () => {
    const p = await preparar(),
      outro = await preparar();
    await recusa(db.insert(claims).values({ ...p.pedido, entitlementId: outro.grant.id }), "23503");
  });

  it.each([
    ["courtesy", "family"],
    ["trial", "individual"],
  ] as const)("o recibo não converte %s/%s em teste de família", async (kind, tier) => {
    const p = await preparar();
    const [outra] = await db
      .insert(grants)
      .values({
        groupId: p.grupo.id,
        kind,
        tier,
        startsAt: p.pedido.startsAt,
        endsAt: p.pedido.endsAt,
        reasonCode: "fixture_outra",
      })
      .returning();
    if (!outra) throw new Error("Concessão alternativa ausente");
    await recusa(db.insert(claims).values({ ...p.pedido, entitlementId: outra.id }), "23503");
  });

  it("coorte e duração precisam concordar com a concessão exata", async () => {
    const p = await preparar();
    await recusa(db.insert(claims).values({ ...p.pedido, cohort: "7d" }), "23514");
    await recusa(
      db.insert(claims).values({
        ...p.pedido,
        startsAt: new Date(p.pedido.startsAt.getTime() + 1000),
        endsAt: new Date(p.pedido.endsAt.getTime() + 1000),
      }),
      "23503",
    );
  });

  it("revogar é possível, mas apagar ou estender a concessão usada não reinicia teste", async () => {
    const p = await preparar();
    await db.insert(claims).values(p.pedido);
    await db.update(grants).set({ revokedAt: new Date() }).where(eq(grants.id, p.grant.id));
    await recusa(db.delete(grants).where(eq(grants.id, p.grant.id)), "23503");
    await recusa(
      db
        .update(grants)
        .set({
          endsAt: new Date(p.grant.endsAt.getTime() + HORAS_48),
        })
        .where(eq(grants.id, p.grant.id)),
      "23503",
    );
    const [grant] = await db.select().from(grants).where(eq(grants.id, p.grant.id));
    expect(grant?.revokedAt).toBeInstanceOf(Date);
    expect(grant?.endsAt).toEqual(p.grant.endsAt);
  });

  it("um ID inventado não substitui consentimento", async () => {
    const p = await preparar();
    await recusa(db.insert(claims).values({ ...p.pedido, enrollmentId: randomUUID() }), "23503");
  });
});
