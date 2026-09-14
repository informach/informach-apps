import { generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { type BillingServiceConfig, createBillingService } from "@informach/billing";
import { closeRemoteBillingForSubject } from "@informach/billing/subscriptions";
import { PRODUCTS } from "@informach/config";
import { db, eq } from "@informach/db";
import {
  customers,
  emailDeliveries,
  emailSuppressions,
  emailUnsubscribes,
  missaoContentControls,
  missaoReports,
  subscriptions,
  users,
} from "@informach/db/schema";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { POST as sendgridWebhook } from "@/app/api/webhooks/sendgrid/route";
import { maintainBilling } from "@/features/billing/maintenance";
import { withBillingLifecycle } from "@/features/billing/repository";
import { billing, getAccess, handleBillingEvent } from "@/features/billing/service";
import { findLesson } from "@/features/content/catalog";
import { contentHash } from "@/features/content/version";
import {
  contentReports,
  maintenanceHistory,
  recordContentControl,
} from "@/features/content-maintenance/repository";
import {
  clearFamily,
  contentStates,
  getProfiles,
  startSession,
} from "@/features/learning/repository";
import { createProfile } from "@/features/learning/service";
import { emails } from "@/lib/emails";
import { env } from "@/lib/env";

const owner = randomUUID();
const email = `operations-${owner}@example.test`;
const profileInput = {
  nickname: "Sol",
  grade: 6,
  avatar: "cometa",
  courseId: "olitef-n1",
  consent: true,
};
let profileId = "";
afterAll(async () => {
  await db.delete(missaoContentControls).where(eq(missaoContentControls.actorId, owner));
});
beforeAll(async () => {
  await db.insert(users).values({ id: owner, name: "Operations test", email, emailVerified: true });
  profileId = (await createProfile(owner, profileInput)).id;
});
describe("operational boundaries on isolated PostgreSQL", () => {
  it("runs more lifecycle callers than the query pool size without starving their queries", async () => {
    const result = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        withBillingLifecycle(`parallel-${i}-${owner}`, async () => {
          const rows = await db.select({ id: users.id }).from(users).where(eq(users.id, owner));
          return rows[0]?.id;
        }),
      ),
    );
    expect(result).toEqual(Array(12).fill(owner));
  }, 5000);
  it("keeps older pending reports and current maintenance states accessible beyond history page limits", async () => {
    const lesson = findLesson("porcentagem-1");
    if (!lesson) throw new Error("Missing fixture");
    await recordContentControl({
      lessonId: lesson.id,
      version: 1,
      contentHash: contentHash(lesson),
      status: "available",
      actorId: owner,
      note: "Initial operational availability fixture",
    });
    await db.insert(missaoContentControls).values(
      Array.from({ length: 210 }, (_, i) => ({
        lessonId: "medidas-1",
        version: 1,
        contentHash: "history",
        status: "suspended" as const,
        actorId: owner,
        note: `History fixture ${i}`,
      })),
    );
    await db.insert(missaoReports).values([
      {
        userId: owner,
        lessonId: lesson.id,
        version: 1,
        itemId: lesson.items[0]?.id ?? "item",
        detail: "Old unresolved report",
        createdAt: new Date("2025-01-01Z"),
      },
      ...Array.from({ length: 105 }, () => ({
        userId: owner,
        lessonId: lesson.id,
        version: 1,
        itemId: "item",
        detail: "Already resolved",
        status: "resolved" as const,
        resolvedAt: new Date(),
      })),
    ]);
    expect(
      (await contentReports()).some((report) => report.detail === "Old unresolved report"),
    ).toBe(true);
    expect((await contentReports()).every((report) => report.status !== "resolved")).toBe(true);
    expect(await maintenanceHistory()).toHaveLength(201);
    expect((await maintenanceHistory(1)).length).toBeGreaterThan(0);
    expect((await contentStates()).get(lesson.id)?.status).toBe("available");
    await recordContentControl({
      lessonId: lesson.id,
      version: 1,
      contentHash: contentHash(lesson),
      status: "suspended",
      actorId: owner,
      note: "Suspended before repository insert",
    });
    await expect(
      startSession(owner, profileId, lesson, "mission", randomUUID()),
    ).rejects.toMatchObject({ code: "WITHDRAWN" });
  });
  it("retains signed SendGrid category/user metadata across the route and records the right unsubscribe", async () => {
    const keys = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const previous = env.SENDGRID_WEBHOOK_PUBLIC_KEY;
    env.SENDGRID_WEBHOOK_PUBLIC_KEY = keys.publicKey
      .export({ type: "spki", format: "der" })
      .toString("base64");
    const timestamp = String(Math.floor(Date.now() / 1000));
    const body = JSON.stringify([
      {
        email,
        event: "group_unsubscribe",
        timestamp: Number(timestamp),
        category: ["billing.payment-failed"],
        user_id: owner,
      },
      {
        email,
        event: "bounce",
        timestamp: Number(timestamp),
        category: ["billing.payment-failed"],
        reason: "Invalid mailbox",
      },
      {
        email,
        event: "group_unsubscribe",
        timestamp: Number(timestamp),
        category: "billing.payment-failed",
        user_id: owner,
      },
    ]);
    const signature = sign("sha256", Buffer.from(timestamp + body), keys.privateKey).toString(
      "base64",
    );
    try {
      const request = () =>
        new Request("http://localhost/api/webhooks/sendgrid", {
          method: "POST",
          body,
          headers: {
            "x-twilio-email-event-webhook-signature": signature,
            "x-twilio-email-event-webhook-timestamp": timestamp,
          },
        });
      expect((await sendgridWebhook(request())).status).toBe(200);
      expect((await sendgridWebhook(request())).status).toBe(200);
      const preferences = await db
        .select()
        .from(emailUnsubscribes)
        .where(eq(emailUnsubscribes.userId, owner));
      expect(preferences.map((row) => row.category)).toEqual(["billing.payment-failed"]);
      expect(
        await db.select().from(emailSuppressions).where(eq(emailSuppressions.email, email)),
      ).toHaveLength(1);
      expect(
        (
          await sendgridWebhook(
            new Request("http://localhost/api/webhooks/sendgrid", { method: "POST", body }),
          )
        ).status,
      ).toBe(400);
    } finally {
      env.SENDGRID_WEBHOOK_PUBLIC_KEY = previous;
    }
  });
  it("prefers the recorded delivery category over provider arrays or conflicting custom arguments", async () => {
    const keys = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const previous = env.SENDGRID_WEBHOOK_PUBLIC_KEY;
    env.SENDGRID_WEBHOOK_PUBLIC_KEY = keys.publicKey
      .export({ type: "spki", format: "der" })
      .toString("base64");
    const [delivery] = await db
      .insert(emailDeliveries)
      .values({
        id: randomUUID(),
        subject: "Category fixture",
        recipient: email,
        userId: owner,
        category: "billing.subscription-renewed",
        messageKey: `category-${owner}`,
      })
      .returning();
    if (!delivery) throw new Error("Missing delivery");
    const timestamp = String(Math.floor(Date.now() / 1000));
    const body = JSON.stringify([
      {
        email,
        event: "group_unsubscribe",
        timestamp: Number(timestamp),
        delivery_id: delivery.id,
        category: ["unrelated", "billing.payment-failed"],
        informach_category: "conflicting",
        user_id: owner,
      },
    ]);
    try {
      const response = await sendgridWebhook(
        new Request("http://localhost/api/webhooks/sendgrid", {
          method: "POST",
          body,
          headers: {
            "x-twilio-email-event-webhook-signature": sign(
              "sha256",
              Buffer.from(timestamp + body),
              keys.privateKey,
            ).toString("base64"),
            "x-twilio-email-event-webhook-timestamp": timestamp,
          },
        }),
      );
      expect(response.status).toBe(200);
      const preferences = await db
        .select()
        .from(emailUnsubscribes)
        .where(eq(emailUnsubscribes.userId, owner));
      expect(preferences.map((row) => row.category).sort()).toEqual([
        "billing.payment-failed",
        "billing.subscription-renewed",
      ]);
    } finally {
      env.SENDGRID_WEBHOOK_PUBLIC_KEY = previous;
    }
  });
  it("preserves dunning attempts on failed/deferred deliveries and stops suppressed delivery without counting it sent", async () => {
    const [customer] = await db
      .insert(customers)
      .values({
        provider: "stripe",
        providerCustomerId: `cus_${owner}`,
        subjectType: "user",
        subjectId: owner,
        app: "missao-saber",
        email,
      })
      .returning();
    if (!customer) throw new Error("Missing customer");
    const [subscription] = await db
      .insert(subscriptions)
      .values({
        customerId: customer.id,
        provider: "stripe",
        providerSubscriptionId: `sub_${owner}`,
        productId: "missao_individual_monthly",
        providerPriceId: "price_fixture",
        status: "past_due",
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 86400000),
        metadata: { dunning: { pending: true, lastInvoiceId: `in_${owner}`, attempts: 0 } },
      })
      .returning();
    if (!subscription) throw new Error("Missing subscription");
    const reconciliation = vi
      .spyOn(billing, "reconcileSubscriptions")
      .mockResolvedValue({ scanned: 0, reconciled: 0, mismatches: 0, errors: 0 });
    const send = vi.spyOn(emails, "sendEmail");
    try {
      for (const status of ["failed", "deferred"] as const) {
        send.mockResolvedValue({
          ok: false,
          status,
          reason: "in-flight",
          deliveryId: randomUUID(),
        });
        expect((await maintainBilling()).dunning.sent).toBe(0);
        const [row] = await db
          .select()
          .from(subscriptions)
          .where(eq(subscriptions.id, subscription.id));
        expect(row?.metadata.dunning).toMatchObject({ pending: true, attempts: 0 });
        expect(row?.metadata.dunning).not.toHaveProperty("lastSentAt");
      }
      send.mockResolvedValue({
        ok: false,
        status: "skipped",
        reason: "unsubscribed",
        deliveryId: randomUUID(),
      });
      expect((await maintainBilling()).dunning.sent).toBe(0);
      const [row] = await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.id, subscription.id));
      expect(row?.metadata.dunning).toMatchObject({ pending: false, attempts: 0 });
    } finally {
      send.mockRestore();
      reconciliation.mockRestore();
    }
  });
  it("serializes closure, rejects late checkout, and ignores old active events even after family recreation", async () => {
    let unblock: () => void = () => {};
    let locked: () => void = () => {};
    const ready = new Promise<void>((resolve) => {
      locked = resolve;
    });
    const pending = new Promise<void>((resolve) => {
      unblock = resolve;
    });
    const first = withBillingLifecycle(owner, async () => {
      locked();
      await pending;
    });
    await ready;
    await expect(
      withBillingLifecycle(owner, async () => db.select({ id: users.id }).from(users).limit(1)),
    ).rejects.toMatchObject({ code: "BUSY" });
    let webhookSettled = false;
    const waitingWebhook = handleBillingEvent({
      id: `evt_${randomUUID()}`,
      type: "checkout.session.expired",
      payload: {
        data: {
          object: {
            id: `cs_expired_${owner}`,
            customer: `cus_${owner}`,
            status: "expired",
            metadata: {},
          },
        },
      },
    }).then((result) => {
      webhookSettled = true;
      return result;
    });
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(webhookSettled).toBe(false);
    unblock();
    await first;
    expect(await waitingWebhook).toMatchObject({ processed: true });
    const unprojected = `sub_pending_${owner}`;
    const provider = {
      closeCustomerSubscriptions: async () => ({
        expired: 2,
        canceled: 2,
        subscriptionIds: [`sub_${owner}`, unprojected],
      }),
    } as unknown as NonNullable<BillingServiceConfig["providerClient"]>;
    await withBillingLifecycle(owner, async () => {
      await closeRemoteBillingForSubject(
        {
          db,
          provider: "stripe",
          providerClient: provider,
          organizationsEnabled: false,
          app: "missao-saber",
        },
        { type: "user", id: owner },
      );
      await clearFamily(owner);
    });
    expect(await getProfiles(owner)).toEqual([]);
    for (const id of [`sub_${owner}`, unprojected]) {
      expect(
        await handleBillingEvent({
          id: `evt_${randomUUID()}`,
          type: "customer.subscription.created",
          payload: {
            data: {
              object: {
                id,
                customer: `cus_${owner}`,
                status: "active",
                items: { data: [{ price: { id: "price_fixture" } }] },
                metadata: { product_id: "missao_individual_monthly" },
              },
            },
          },
        }),
      ).toMatchObject({ reason: "subscription_closed" });
    }
    expect((await getAccess(owner)).paid).toBe(false);
    await createProfile(owner, profileInput);
    expect((await getAccess(owner)).paid).toBe(false);
    expect(await getProfiles(owner)).toHaveLength(1);
    expect(
      await handleBillingEvent({
        id: `evt_${randomUUID()}`,
        type: "invoice.payment_failed",
        payload: {
          data: {
            object: {
              id: "in_late",
              customer: `cus_${owner}`,
              parent: { subscription_details: { subscription: unprojected } },
            },
          },
        },
      }),
    ).toMatchObject({ reason: "subscription_closed" });
  });
  it("does not mutate another app through invoice failure or foreign subscription recovery", async () => {
    const remoteCustomer = `cus_other_${owner}`;
    const remoteSubscription = `sub_other_${owner}`;
    const [customer] = await db
      .insert(customers)
      .values({
        provider: "stripe",
        providerCustomerId: remoteCustomer,
        subjectType: "user",
        subjectId: owner,
        app: "cozya",
        email,
      })
      .returning();
    if (!customer) throw new Error("Missing foreign customer");
    await db.insert(subscriptions).values({
      customerId: customer.id,
      provider: "stripe",
      providerSubscriptionId: remoteSubscription,
      productId: "cozya_pro_monthly",
      providerPriceId: "price_other_fixture",
      status: "active",
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 86400000),
    });
    const event = (customerId: string, subscriptionId: string) => ({
      id: `evt_${randomUUID()}`,
      type: "invoice.payment_failed",
      payload: {
        data: {
          object: {
            id: "in_cross_app",
            customer: customerId,
            parent: { subscription_details: { subscription: subscriptionId } },
          },
        },
      },
    });
    expect(await handleBillingEvent(event(remoteCustomer, remoteSubscription))).toMatchObject({
      reason: "foreign_or_unknown_customer",
    });
    const [foreign] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.providerSubscriptionId, remoteSubscription));
    expect(foreign?.status).toBe("active");
    expect(foreign?.metadata).not.toHaveProperty("dunning");
    const provider = {
      retrieveSubscriptionDetails: async () => ({
        id: `sub_${owner}`,
        providerCustomerId: `cus_${owner}`,
        providerPriceId: "price_fixture",
        productId: "missao_individual_monthly",
        status: "active",
        cancelAtPeriodEnd: false,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 86400000),
        canceledAt: null,
        trialEnd: null,
        metadata: {},
      }),
    } as unknown as NonNullable<BillingServiceConfig["providerClient"]>;
    const otherApp = createBillingService({
      provider: "stripe",
      providerClient: provider,
      app: "cozya",
      appName: "Other test endpoint",
      db,
      publicAppUrl: "http://localhost",
      products: PRODUCTS.filter((product) => product.app === "cozya"),
      stripeMode: "dev",
      organizationsEnabled: false,
      resolveSubjectEmail: async () => email,
    });
    await otherApp.handleStripeEvent(event(`cus_${owner}`, `sub_${owner}`));
    const [closed] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.providerSubscriptionId, `sub_${owner}`));
    expect(closed?.status).toBe("canceled");
    expect(closed?.metadata.dunning).toMatchObject({ pending: false });
  });
});
