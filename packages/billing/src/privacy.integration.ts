import { randomUUID } from "node:crypto";
import type { Database } from "@informach/db";
import * as schema from "@informach/db/schema";
import { createFamilyService } from "@informach/family";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, expect, it } from "vitest";
import { openCompassoAccount } from "./collection-accounts";
import { exportPersonalBillingRecords } from "./privacy";

const url = process.env.DATABASE_URL;
if (
  !url ||
  process.env.COMPASSO_ISOLATED_DATABASE !== "1" ||
  !["localhost", "127.0.0.1", "postgres"].includes(new URL(url).hostname)
)
  throw new Error("Disposable PostgreSQL required");
const connection = postgres(url, { max: 4, prepare: false });
const db: Database = drizzle(connection, { schema });
afterAll(() => connection.end());

it("exports every personal page and terminal contract without exposing another payer or Edi", async () => {
  const payer = randomUUID();
  const member = randomUUID();
  await db.insert(schema.users).values(
    [payer, member].map((id) => ({
      id,
      name: "Export fixture",
      email: `${id}@example.test`,
      emailVerified: true,
    })),
  );
  const family = createFamilyService({ db });
  const group = await family.createGroup(payer, "Export family");
  const account = await openCompassoAccount(db, payer, group.id);
  const invitation = await family.createInvitation(payer, group.id, `${member}@example.test`);
  await family.acceptInvitation(member, invitation.token);
  const [personal, household, edi, other] = await db
    .insert(schema.customers)
    .values(
      [
        { app: "cozya", subjectType: "user" as const, subjectId: payer },
        { app: "compasso", subjectType: "billing_account" as const, subjectId: account.id },
        { app: "edi", subjectType: "user" as const, subjectId: payer },
        { app: "cozya", subjectType: "user" as const, subjectId: member },
      ].map((customer) => ({
        ...customer,
        provider: "stripe" as const,
        providerCustomerId: `cus_${randomUUID()}`,
        email: "billing@example.test",
        metadata: { private: "DO_NOT_EXPORT" },
      })),
    )
    .returning();
  if (!personal || !household || !edi || !other) throw new Error("Missing synthetic customers");
  const now = new Date();
  const [contract] = await db
    .insert(schema.subscriptions)
    .values({
      customerId: personal.id,
      provider: "stripe",
      providerSubscriptionId: `sub_${randomUUID()}`,
      providerPriceId: "price_historical",
      productId: "cozya_historical",
      status: "canceled",
      currentPeriodStart: new Date(now.getTime() - 30 * 86400000),
      currentPeriodEnd: now,
      canceledAt: now,
      confirmedAt: now,
      metadata: { private: "DO_NOT_EXPORT" },
    })
    .returning();
  if (!contract) throw new Error("Missing synthetic contract");
  await db
    .insert(schema.legacyPaymentEvidenceReviews)
    .values({ subscriptionId: contract.id, detectedAt: now });
  const [period] = await db
    .insert(schema.subscriptionPaymentPeriods)
    .values({
      subscriptionId: contract.id,
      provider: "stripe",
      providerInvoiceId: `in_${randomUUID()}`,
      providerLineId: "il_fixture",
      providerPriceId: "price_historical",
      periodStart: contract.currentPeriodStart,
      periodEnd: contract.currentPeriodEnd,
      paidAt: now,
    })
    .returning();
  if (!period) throw new Error("Missing paid period");
  const [acceptance] = await db
    .insert(schema.legacyContractAcceptances)
    .values({
      groupId: group.id,
      payerUserId: payer,
      subscriptionId: contract.id,
      policyVersion: "fixture-v1",
    })
    .returning();
  if (!acceptance) throw new Error("Missing acceptance");
  await db.insert(schema.legacyContractAcceptancePeriods).values({
    acceptanceId: acceptance.id,
    paymentPeriodId: period.id,
  });
  const [future] = await db
    .insert(schema.legacyFutureIntents)
    .values({
      accountId: account.id,
      payerUserId: payer,
      requestKey: randomUUID(),
      productId: "compasso_monthly",
      providerPriceId: "price_private",
      amountCents: 4990,
      interval: "month",
      paidThrough: now,
      startsAt: new Date(now.getTime() + 1000),
      termsRevision: "a".repeat(64),
      setupExpiresAt: new Date(now.getTime() + 3600_000),
      state: "canceled",
      paymentMethodId: "pm_private",
    })
    .returning();
  if (!future) throw new Error("Missing future intent");
  await db.insert(schema.oneTimePayments).values(
    [
      ...Array.from({ length: 205 }, () => ({
        customerId: personal.id,
        productId: "cozya_credits",
      })),
      { customerId: household.id, productId: "compasso_credits" },
      { customerId: edi.id, productId: "EDI_PRIVATE_PRODUCT" },
      { customerId: other.id, productId: "OTHER_PAYER_PRIVATE_PRODUCT" },
    ].map((payment) => ({
      ...payment,
      provider: "stripe" as const,
      providerPaymentId: `pi_${randomUUID()}`,
      amountCents: 100,
      status: "paid" as const,
      creditAmount: 10,
      metadata: { private: "DO_NOT_EXPORT" },
    })),
  );
  await db.insert(schema.creditLedger).values(
    Array.from({ length: 205 }, () => ({
      ownerType: "user" as const,
      ownerId: payer,
      app: "cozya",
      entryType: "promo_grant" as const,
      amount: 1,
      metadata: { private: "DO_NOT_EXPORT" },
    })),
  );
  await family.transferAdministration(payer, group.id, member);
  await family.revokeMember(member, group.id, payer);

  const chunks = await collect(exportPersonalBillingRecords(db, payer));
  expect(chunks.every((chunk) => chunk.records.length <= 100)).toBe(true);
  expect(
    chunks.filter((chunk) => chunk.kind === "billing.payments").flatMap((chunk) => chunk.records),
  ).toHaveLength(206);
  expect(
    chunks
      .filter((chunk) => chunk.kind === "billing.personal_credits")
      .flatMap((chunk) => chunk.records),
  ).toHaveLength(205);
  expect(chunks.find((chunk) => chunk.kind === "billing.subscriptions")?.records).toEqual([
    expect.objectContaining({ id: contract.id, status: "canceled" }),
  ]);
  expect(chunks.find((chunk) => chunk.kind === "billing.paid_periods")?.records).toHaveLength(1);
  expect(
    chunks.find((chunk) => chunk.kind === "billing.legacy_payment_evidence_reviews")?.records,
  ).toEqual([expect.objectContaining({ id: contract.id, app: "cozya" })]);
  expect(
    chunks.find((chunk) => chunk.kind === "billing.legacy_contract_acceptances")?.records,
  ).toEqual([expect.objectContaining({ id: acceptance.id, subscriptionId: contract.id })]);
  expect(
    chunks.find((chunk) => chunk.kind === "billing.legacy_contract_accepted_periods")?.records,
  ).toEqual([{ id: period.id, acceptanceId: acceptance.id }]);
  expect(chunks.find((chunk) => chunk.kind === "billing.future_contract_intents")?.records).toEqual(
    [expect.objectContaining({ id: future.id, state: "canceled" })],
  );
  const exported = JSON.stringify(chunks);
  for (const privateValue of [
    "DO_NOT_EXPORT",
    "EDI_PRIVATE_PRODUCT",
    "OTHER_PAYER_PRIVATE_PRODUCT",
    "providerPaymentId",
    "providerSubscriptionId",
    "metadata",
    "pm_private",
  ])
    expect(exported).not.toContain(privateValue);
  const otherExport = JSON.stringify(await collect(exportPersonalBillingRecords(db, member)));
  expect(otherExport).toContain("OTHER_PAYER_PRIVATE_PRODUCT");
  expect(otherExport).not.toContain(personal.id);
  expect(otherExport).not.toContain(contract.id);
  expect(otherExport).not.toContain(household.id);
  expect(otherExport).not.toContain(acceptance.id);
  expect(otherExport).not.toContain(future.id);
});

async function collect<T>(source: AsyncIterable<T>) {
  const values: T[] = [];
  for await (const value of source) values.push(value);
  return values;
}
