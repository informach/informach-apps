import { randomUUID } from "node:crypto";
import { db, eq, sql } from "@informach/db";
import {
  recreioGroups as groups,
  recreioBillingReconciliations as jobs,
} from "@informach/db/schema";
import { describe, expect, it } from "vitest";
import { codigoDoBanco, novaConta } from "./apoio";

/** Integridade SQL apenas; estas linhas não comprovam comunicação ou pagamento. */
async function fixture() {
  const conta = await novaConta();
  const [grupo] = await db.insert(groups).values({ ownerUserId: conta.id }).returning();
  if (!grupo) throw new Error("Fixture group absent");
  const [job] = await db
    .insert(jobs)
    .values({ payerUserId: conta.id, groupId: grupo.id, providerMode: "dev" })
    .returning();
  if (!job) throw new Error("Fixture reconciliation absent");
  return { conta, grupo, job };
}

describe("integridade do estado de conciliação", () => {
  it("mantém modo, pagante e grupo exatos e permite fila separada para outro modo", async () => {
    const f = await fixture(),
      outro = await novaConta();
    expect(f.job).toMatchObject({
      reviewRequired: true,
      reviewReason: "awaiting_provider",
      lastAttemptAt: null,
      lastConfirmedAt: null,
      attemptCount: 0,
    });
    // A partição prod ainda está livre: esta recusa prova a FK, sem colidir
    // antes com a unicidade de grupo/modo exercitada separadamente abaixo.
    expect(
      await codigoDoBanco(
        db
          .insert(jobs)
          .values({ payerUserId: outro.id, groupId: f.grupo.id, providerMode: "prod" }),
      ),
    ).toBe("23503");
    await db
      .insert(jobs)
      .values({ payerUserId: f.conta.id, groupId: f.grupo.id, providerMode: "prod" });
    expect(
      await codigoDoBanco(
        db
          .insert(jobs)
          .values({ payerUserId: f.conta.id, groupId: f.grupo.id, providerMode: "dev" }),
      ),
    ).toBe("23505");
    expect(
      await codigoDoBanco(
        db.update(groups).set({ ownerUserId: outro.id }).where(eq(groups.id, f.grupo.id)),
      ),
    ).toBe("23503");
    expect(["23001", "23503"]).toContain(
      await codigoDoBanco(db.delete(groups).where(eq(groups.id, f.grupo.id))),
    );
  });
  const invalidas: [string, ReturnType<typeof sql>][] = [
    ["modo desconhecido", sql`provider_mode='unknown'`],
    ["confirmação sem tentativa", sql`last_confirmed_at=created_at`],
    ["sem revisão e sem confirmação", sql`review_required=false,review_reason=null`],
    [
      "sem revisão com motivo",
      sql`last_attempt_at=created_at,attempt_count=1,last_confirmed_at=created_at,review_required=false`,
    ],
    ["revisão sem motivo", sql`review_reason=null`],
    ["motivo desconhecido", sql`review_reason='inventado'`],
    ["contador sem tentativa", sql`attempt_count=1`],
    ["tentativa sem contador", sql`last_attempt_at=created_at`],
    ["contador negativo", sql`attempt_count=-1`],
    ["lease sem prazo", sql`lease_token=${randomUUID()}`],
    ["prazo sem lease", sql`lease_until=created_at+interval '1 minute'`],
    [
      "tentativa anterior à criação",
      sql`last_attempt_at=created_at-interval '1 second',attempt_count=1`,
    ],
    [
      "confirmação anterior à criação",
      sql`last_attempt_at=created_at,attempt_count=1,last_confirmed_at=created_at-interval '1 second'`,
    ],
  ];
  it.each(invalidas)("recusa %s", async (_nome, alteracao) => {
    const f = await fixture();
    expect(
      await codigoDoBanco(
        db.execute(
          sql`update recreio.billing_reconciliations set ${alteracao} where payer_user_id=${f.conta.id}`,
        ),
      ),
    ).toBe("23514");
  });
  it("uma falha posterior pode manter a última confirmação sem apagá-la ou renová-la", async () => {
    const f = await fixture();
    await db.execute(sql`update recreio.billing_reconciliations set last_attempt_at=created_at,
      last_confirmed_at=created_at,attempt_count=1,review_required=false,review_reason=null where payer_user_id=${f.conta.id}`);
    await db.execute(sql`update recreio.billing_reconciliations set last_attempt_at=created_at+interval '1 second',
      updated_at=created_at+interval '1 second',attempt_count=2,review_required=true,review_reason='provider_unavailable' where payer_user_id=${f.conta.id}`);
    const [linha] = await db.select().from(jobs).where(eq(jobs.payerUserId, f.conta.id));
    expect(linha?.lastConfirmedAt).toEqual(f.job.createdAt);
    expect(linha?.lastAttemptAt?.getTime()).toBe(f.job.createdAt.getTime() + 1000);
    expect(linha?.reviewRequired).toBe(true);
  });
});
