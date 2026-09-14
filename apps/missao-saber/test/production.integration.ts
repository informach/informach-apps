import { randomUUID } from "node:crypto";
import { createBillingService } from "@informach/billing";
import { PRODUCTS } from "@informach/config";
import { db, eq } from "@informach/db";
import { customers, emailDeliveries, subscriptions, users } from "@informach/db/schema";
import { createEmailService, dispatchEmail, type SendgridMessage } from "@informach/emails";
import { retryFailedDeliveries } from "@informach/emails/sweepers";
import { afterAll, describe, expect, it } from "vitest";
import { withBillingLifecycle } from "@/features/billing/repository";
import { isContentManager } from "@/features/content-maintenance/service";
import { env } from "@/lib/env";
import { createFakeProvider } from "../../../packages/billing/src/__tests__/_fake-provider";

const owner = randomUUID();
const app = `production-${owner}`;
const now = new Date();
const periodEnd = new Date(now.getTime() + 30 * 86400000);
const catalog = PRODUCTS.filter((p) => p.app === "missao-saber").map((p) => ({
  ...p,
  stripePriceId: { dev: `price_${p.id}`, prod: `price_${p.id}` },
}));

afterAll(async () => {
  const rows = await db.select().from(customers).where(eq(customers.app, app));
  for (const row of rows)
    await db.delete(subscriptions).where(eq(subscriptions.customerId, row.id));
  await db.delete(customers).where(eq(customers.app, app));
  await db.delete(emailDeliveries).where(eq(emailDeliveries.userId, owner));
  await db.delete(users).where(eq(users.id, owner));
});

describe("production infrastructure contracts", () => {
  it("recovers a lost plan-change webhook across keyset pages, and revokes canceled unknown prices", async () => {
    await db.insert(users).values({
      id: owner,
      name: "Production contract",
      email: `${owner}@example.test`,
      emailVerified: true,
    });
    const [customer] = await db
      .insert(customers)
      .values({
        app,
        provider: "stripe",
        providerCustomerId: `cus_${owner}`,
        subjectType: "user",
        subjectId: owner,
        email: `${owner}@example.test`,
      })
      .returning();
    if (!customer) throw new Error("Missing customer");
    await db.insert(subscriptions).values(
      Array.from({ length: 23 }, (_, i) => ({
        customerId: customer.id,
        provider: "stripe" as const,
        providerSubscriptionId: `sub_${owner}_${i}`,
        providerPriceId: "price_missao_individual_monthly",
        productId: "missao_individual_monthly",
        status: "active" as const,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
      })),
    );
    const { provider } = createFakeProvider();
    let unknownCanceled = false;
    let unknownActive = false;
    provider.retrieveSubscriptionDetails = async (id) => ({
      id,
      status: unknownCanceled ? "canceled" : "active",
      cancelAtPeriodEnd: false,
      currentPeriodEnd: periodEnd,
      currentPeriodStart: now,
      canceledAt: null,
      trialEnd: null,
      metadata: {},
      providerCustomerId: customer.providerCustomerId,
      providerPriceId:
        unknownCanceled || unknownActive ? "price_retired" : "price_missao_family_monthly",
      productId: "stale-untrusted-metadata",
    });
    const service = createBillingService({
      db,
      app,
      appName: "Test",
      provider: "stripe",
      providerClient: provider,
      publicAppUrl: "http://localhost:3005",
      products: catalog,
      organizationsEnabled: false,
      stripeMode: "dev",
      resolveSubjectEmail: async () => `${owner}@example.test`,
      withSubjectLock: (subject, operation) => withBillingLifecycle(subject.id, operation),
    });
    let afterId: string | undefined;
    let scanned = 0;
    for (let page = 0; page < 4; page++) {
      const result = await service.reconcileSubscriptions({ batchSize: 10, afterId });
      expect(result.errors).toBe(0);
      scanned += result.scanned;
      afterId = result.nextCursor;
      if (!afterId) break;
    }
    expect(scanned).toBe(23);
    expect(afterId).toBeUndefined();
    const rows = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.customerId, customer.id));
    expect(
      rows.every(
        (row) =>
          row.productId === "missao_family_monthly" &&
          row.providerPriceId === "price_missao_family_monthly",
      ),
    ).toBe(true);
    await db
      .update(subscriptions)
      .set({ status: "unpaid" })
      .where(eq(subscriptions.customerId, customer.id));
    unknownActive = true;
    const rejected = await service.reconcileSubscriptions({ batchSize: 30 });
    expect(rejected.errors).toBe(23);
    expect(rejected.reconciled).toBe(0);
    expect(await service.hasProSubscription({ type: "user", id: owner })).toBe(false);
    unknownCanceled = true;
    expect((await service.reconcileSubscriptions({ batchSize: 30 })).reconciled).toBe(23);
    expect(await service.hasProSubscription({ type: "user", id: owner })).toBe(false);
  });

  it("retries the originating envelope despite more than a page of bodyless OTPs and stale reminders", async () => {
    const deliveries = Array.from({ length: 55 }, (_, i) => ({
      id: randomUUID(),
      userId: owner,
      recipient: `${owner}@example.test`,
      category: "auth.verify-email-otp",
      messageKey: `no-body-${owner}-${i}`,
      subject: "OTP",
      status: "failed",
      sendAttempts: 1,
      updatedAt: new Date(0),
    }));
    await db.insert(emailDeliveries).values(deliveries);
    await db.insert(emailDeliveries).values({
      id: randomUUID(),
      userId: owner,
      recipient: `${owner}@example.test`,
      category: "billing.payment-failed",
      messageKey: `stale-${owner}`,
      subject: "Old reminder",
      text: "Old reminder",
      status: "failed",
      sendAttempts: 1,
    });
    const outbound = createEmailService({
      apiKey: "test",
      defaultFrom: "Missão <missao@example.test>",
      db,
      mode: "memory",
    });
    const sent = await outbound.sendEmail({
      to: `${owner}@example.test`,
      userId: owner,
      subject: "Receipt",
      text: "Receipt",
      category: "billing.payment-success",
      messageKey: `envelope-${owner}`,
      unsubscribeUrl: "https://missao.example.test/api/email/unsubscribe?t=original",
    });
    await db
      .update(emailDeliveries)
      .set({ status: "failed", providerAccepted: false, nextAttemptAt: null })
      .where(eq(emailDeliveries.id, sent.deliveryId));
    const messages: SendgridMessage[] = [];
    const result = await retryFailedDeliveries({
      db,
      defaultFrom: "Other <other@example.test>",
      batchSize: 50,
      buildUnsubscribeUrl: () => "https://other.example.test/wrong",
      send: async (message) => {
        messages.push(message);
        return { messageId: "accepted-test" };
      },
    });
    expect(result.retried).toBe(1);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      from: "Missão <missao@example.test>",
      headers: {
        "List-Unsubscribe": "<https://missao.example.test/api/email/unsubscribe?t=original>",
      },
      customArgs: { informach_category: "billing.payment-success" },
    });
    expect(messages[0]?.customArgs).not.toHaveProperty("category");
  });

  it("does not regress a webhook delivery that wins the provider-response race", async () => {
    const dispatchResult = await dispatchEmail(
      {
        db,
        defaultFrom: "Missão <missao@example.test>",
        mode: "live",
        sandboxDir: "./tmp",
        sleep: async () => {},
        send: async (message) => {
          const deliveryId = message.customArgs?.delivery_id;
          if (!deliveryId) throw new Error("Missing delivery id");
          await db
            .update(emailDeliveries)
            .set({ status: "delivered" })
            .where(eq(emailDeliveries.id, deliveryId));
          return { messageId: "race-accepted" };
        },
      },
      {
        to: `${owner}@example.test`,
        userId: owner,
        subject: "Race",
        text: "Race",
        category: "billing.payment-success",
        messageKey: `dispatch-race-${owner}`,
        unsubscribeUrl: "https://missao.example.test/api/email/unsubscribe?t=race",
      },
    );
    if (!dispatchResult.ok) throw new Error(dispatchResult.reason);
    expect(dispatchResult.status).toBe("sent");
    const [delivery] = await db
      .select()
      .from(emailDeliveries)
      .where(eq(emailDeliveries.id, dispatchResult.deliveryId));
    expect(delivery).toMatchObject({
      status: "delivered",
      providerAccepted: true,
      providerMessageId: "race-accepted",
    });

    await db
      .update(emailDeliveries)
      .set({
        status: "failed",
        providerAccepted: false,
        providerMessageId: null,
        nextAttemptAt: null,
      })
      .where(eq(emailDeliveries.id, dispatchResult.deliveryId));
    await retryFailedDeliveries({
      db,
      defaultFrom: "Missão <missao@example.test>",
      buildUnsubscribeUrl: () => "https://missao.example.test/api/email/unsubscribe?t=race",
      send: async (message) => {
        const deliveryId = message.customArgs?.delivery_id;
        if (!deliveryId) throw new Error("Missing delivery id");
        await db
          .update(emailDeliveries)
          .set({ status: "delivered" })
          .where(eq(emailDeliveries.id, deliveryId));
        return { messageId: "retry-race-accepted" };
      },
    });
    const [retried] = await db
      .select()
      .from(emailDeliveries)
      .where(eq(emailDeliveries.id, dispatchResult.deliveryId));
    expect(retried).toMatchObject({
      status: "delivered",
      providerAccepted: true,
      providerMessageId: "retry-race-accepted",
    });
  });

  it("does not replace a terminal webhook failure with a late transport failure", async () => {
    const result = await dispatchEmail(
      {
        db,
        defaultFrom: "Missão <missao@example.test>",
        mode: "live",
        sandboxDir: "./tmp",
        inlineRetryAttempts: 1,
        send: async (message) => {
          const deliveryId = message.customArgs?.delivery_id;
          if (!deliveryId) throw new Error("Missing delivery id");
          await db
            .update(emailDeliveries)
            .set({ status: "bounced", providerAccepted: true, lastError: "mailbox rejected" })
            .where(eq(emailDeliveries.id, deliveryId));
          throw Object.assign(new Error("late transport failure"), {
            response: { statusCode: 503 },
          });
        },
      },
      {
        to: `${owner}@example.test`,
        userId: owner,
        subject: "Late failure",
        text: "Late failure",
        category: "billing.subscription-renewed",
        messageKey: `dispatch-late-failure-${owner}`,
        unsubscribeUrl: "https://missao.example.test/api/email/unsubscribe?t=late",
      },
    );
    const [delivery] = await db
      .select()
      .from(emailDeliveries)
      .where(eq(emailDeliveries.id, result.deliveryId));
    expect(delivery).toMatchObject({
      status: "bounced",
      providerAccepted: true,
      lastError: "mailbox rejected",
    });
  });

  it("stops inline and sweeper retries after a processed webhook confirms acceptance", async () => {
    let sendCalls = 0;
    const result = await dispatchEmail(
      {
        db,
        defaultFrom: "Missão <missao@example.test>",
        mode: "live",
        sandboxDir: "./tmp",
        inlineRetryAttempts: 3,
        sleep: async () => {},
        send: async (message) => {
          sendCalls += 1;
          const deliveryId = message.customArgs?.delivery_id;
          if (!deliveryId) throw new Error("Missing delivery id");
          await db
            .update(emailDeliveries)
            .set({ providerAccepted: true })
            .where(eq(emailDeliveries.id, deliveryId));
          throw Object.assign(new Error("response lost after processed event"), {
            response: { statusCode: 503 },
          });
        },
      },
      {
        to: `${owner}@example.test`,
        userId: owner,
        subject: "Processed race",
        text: "Processed race",
        category: "billing.credits-purchased",
        messageKey: `dispatch-processed-${owner}`,
        unsubscribeUrl: "https://missao.example.test/api/email/unsubscribe?t=processed",
      },
    );
    expect(result).toMatchObject({ ok: true, status: "sent" });
    expect(sendCalls).toBe(1);
    const [accepted] = await db
      .select()
      .from(emailDeliveries)
      .where(eq(emailDeliveries.id, result.deliveryId));
    expect(accepted).toMatchObject({ status: "sent", providerAccepted: true });

    await db
      .update(emailDeliveries)
      .set({ status: "failed", providerAccepted: true, nextAttemptAt: null })
      .where(eq(emailDeliveries.id, result.deliveryId));
    const retrySend = async () => {
      throw new Error("accepted delivery must not be retried");
    };
    const retryResult = await retryFailedDeliveries({
      db,
      defaultFrom: "Missão <missao@example.test>",
      buildUnsubscribeUrl: () => "https://missao.example.test/api/email/unsubscribe?t=processed",
      send: retrySend,
    });
    expect(retryResult.retried).toBe(0);
    expect(sendCalls).toBe(1);
  });

  it("grants content maintenance access only to the verified configured identity", async () => {
    const previous = env.MISSAO_CONTENT_MANAGER_EMAILS;
    env.MISSAO_CONTENT_MANAGER_EMAILS = `${owner}@example.test`;
    try {
      expect(await isContentManager(owner)).toBe(true);
      await db.update(users).set({ emailVerified: false }).where(eq(users.id, owner));
      expect(await isContentManager(owner)).toBe(false);
      expect(await isContentManager(randomUUID())).toBe(false);
    } finally {
      env.MISSAO_CONTENT_MANAGER_EMAILS = previous;
    }
  });
});
