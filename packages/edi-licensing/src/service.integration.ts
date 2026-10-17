import { generateKeyPairSync, randomUUID } from "node:crypto";
import { db } from "@informach/db";
import {
  customers,
  ediActivations,
  ediDevices,
  ediEntitlements,
  subscriptionPaymentPeriods,
  subscriptions,
  users,
} from "@informach/db/schema";
import { DEVICE_CODE_GRANT } from "@informach/edi-contracts";
import { type RequestProof, signRequestProof } from "@informach/edi-contracts/proof";
import { verifyLicense } from "@informach/edi-contracts/verify";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { revokeDevice } from "./devices";
import { createDesktopLicenseService, type DesktopPrincipal } from "./service";
import { createLicenseSigner } from "./sign";

const issuer = "http://localhost:3006";
beforeAll(() => {
  if (process.env.EDI_ISOLATED_DATABASE !== "1") throw new Error("Disposable database required");
});
async function fixture() {
  let now = new Date();
  const userId = randomUUID();
  await db
    .insert(users)
    .values({ id: userId, name: "Service integration", email: `${userId}@example.test` });
  const customer = (
    await db
      .insert(customers)
      .values({
        provider: "stripe",
        providerCustomerId: `cus_${randomUUID()}`,
        subjectType: "user",
        subjectId: userId,
        email: `${userId}@example.test`,
        app: "edi",
      })
      .returning()
  )[0];
  if (!customer) throw new Error("Missing fixture customer");
  const paidThrough = new Date(now.getTime() + 30 * 86400000);
  const subscription = (
    await db
      .insert(subscriptions)
      .values({
        customerId: customer.id,
        provider: "stripe",
        providerSubscriptionId: `sub_${randomUUID()}`,
        productId: "edi_suite_monthly",
        providerPriceId: "price_integration",
        status: "active",
        currentPeriodStart: now,
        currentPeriodEnd: paidThrough,
      })
      .returning()
  )[0];
  if (!subscription) throw new Error("Missing fixture subscription");
  await db.insert(subscriptionPaymentPeriods).values({
    subscriptionId: subscription.id,
    provider: "stripe",
    providerInvoiceId: `in_${randomUUID()}`,
    providerLineId: `il_${randomUUID()}`,
    providerPriceId: "price_integration",
    periodStart: now,
    periodEnd: paidThrough,
    paidAt: now,
    reconciledAt: now,
  });
  await db
    .insert(ediEntitlements)
    .values({ userId, subscriptionId: subscription.id, paidThrough, reconciledAt: now });
  const signing = generateKeyPairSync("ed25519");
  const deviceKeys = generateKeyPairSync("ed25519");
  const input = {
    deviceId: randomUUID(),
    name: "Integration PC",
    publicKeySpki: deviceKeys.publicKey.export({ type: "spki", format: "der" }).toString("base64"),
  };
  const principal: DesktopPrincipal = {
    userId,
    jwtId: randomUUID(),
    issuedAt: Math.floor(now.getTime() / 1000),
    grantType: DEVICE_CODE_GRANT,
  };
  const service = createDesktopLicenseService({
    db,
    audience: `${issuer}/api/desktop`,
    minimumClientVersion: "0.1.0",
    sign: createLicenseSigner({
      privateKeyPem: signing.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
      kid: "integration",
      issuer,
      environment: "development",
    }),
    now: () => now,
  });
  function request(
    path: RequestProof["path"],
    body: Record<string, string>,
    sessionId: string | null = null,
    privateKey = deviceKeys.privateKey,
  ) {
    const raw = JSON.stringify(body);
    const proof = signRequestProof(
      {
        audience: `${issuer}/api/desktop`,
        method: "POST",
        path,
        userId,
        deviceId: body.deviceId ?? input.deviceId,
        sessionId,
        iat: Math.floor(now.getTime() / 1000),
      },
      raw,
      privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    );
    return { raw, proof };
  }
  const activationRequest = request("/api/desktop/activate", input);
  const activation = await service.activate(
    principal,
    activationRequest.raw,
    activationRequest.proof,
  );
  const licenseRequest = (clientVersion = "0.1.0") =>
    request(
      "/api/desktop/license",
      {
        deviceId: input.deviceId,
        sessionId: activation.sessionId,
        toolId: "edifoto",
        clientVersion,
      },
      activation.sessionId,
    );
  return {
    service,
    principal,
    input,
    activation,
    request,
    licenseRequest,
    subscription,
    now: () => now,
    advance: (ms: number) => {
      now = new Date(now.getTime() + ms);
    },
    signing,
  };
}
describe("native license service with real PostgreSQL", () => {
  it("denies an old client and permits renewal after updating without changing its activation", async () => {
    const f = await fixture();
    const old = f.licenseRequest("0.0.9");
    expect(await f.service.license(f.principal, old.raw, old.proof)).toMatchObject({
      status: "denied",
      reason: "update_required",
    });
    const updated = f.licenseRequest("0.1.0");
    expect(await f.service.license(f.principal, updated.raw, updated.proof)).toMatchObject({
      status: "granted",
    });
  });
  it.each(["entitlement", "dispute", "refund"] as const)(
    "prioritizes %s restrictions over an outdated client version",
    async (restriction) => {
      const f = await fixture();
      const initial = f.licenseRequest();
      expect(await f.service.license(f.principal, initial.raw, initial.proof)).toMatchObject({
        status: "granted",
      });
      if (restriction === "entitlement") {
        await db
          .update(ediEntitlements)
          .set({ suspended: true })
          .where(eq(ediEntitlements.userId, f.principal.userId));
      } else {
        await db
          .update(subscriptionPaymentPeriods)
          .set(restriction === "dispute" ? { disputed: true } : { fullyRefunded: true })
          .where(eq(subscriptionPaymentPeriods.subscriptionId, f.subscription.id));
      }
      for (const version of ["0.0.9", "0.1.0"]) {
        const request = f.licenseRequest(version);
        expect(await f.service.license(f.principal, request.raw, request.proof)).toMatchObject({
          status: "denied",
          reason: restriction === "refund" ? "subscription_required" : "suspended",
        });
      }
    },
  );
  it("binds a signed lease to the device and rejects replay of the same signed request", async () => {
    const f = await fixture();
    const request = f.licenseRequest();
    const response = await f.service.license(f.principal, request.raw, request.proof);
    expect(response.status).toBe("granted");
    if (response.status !== "granted") throw new Error("Expected a paid lease");
    expect(
      verifyLicense(response.lease, {
        trustedKeys: {
          integration: f.signing.publicKey.export({ type: "spki", format: "pem" }).toString(),
        },
        issuer,
        environment: "development",
        userId: f.principal.userId,
        deviceId: f.input.deviceId,
        keyThumbprint: f.activation.keyThumbprint,
        activationId: f.activation.activationId,
        minimumRevision: 0,
        clientVersion: "0.1.0",
        toolId: "edifoto",
        now: f.now(),
        lastTrustedTime: f.now(),
      }).valid,
    ).toBe(true);
    await expect(f.service.license(f.principal, request.raw, request.proof)).rejects.toMatchObject({
      code: "invalid_proof",
    });
  });
  it("denies paused billing and account suspension despite future paid facts", async () => {
    const f = await fixture();
    await db
      .update(subscriptions)
      .set({ status: "paused" })
      .where(eq(subscriptions.id, f.subscription.id));
    let request = f.licenseRequest();
    expect(await f.service.license(f.principal, request.raw, request.proof)).toMatchObject({
      status: "denied",
      reason: "payment_required",
    });
    await db.update(users).set({ banned: true }).where(eq(users.id, f.principal.userId));
    request = f.licenseRequest();
    expect(await f.service.license(f.principal, request.raw, request.proof)).toMatchObject({
      status: "denied",
      reason: "suspended",
    });
  });
  it("does not mint a fresh lease from a stale reconciliation", async () => {
    const f = await fixture();
    await db
      .update(ediEntitlements)
      .set({ reconciledAt: new Date(f.now().getTime() - 25 * 3600000) })
      .where(eq(ediEntitlements.userId, f.principal.userId));
    const request = f.licenseRequest();
    await expect(f.service.license(f.principal, request.raw, request.proof)).rejects.toMatchObject({
      name: "EntitlementUnavailableError",
    });
  });
  it("requires a new browser approval after revocation; refresh and older approval cannot reactivate", async () => {
    const f = await fixture();
    await revokeDevice(db, f.principal.userId, f.input.deviceId, f.now());
    f.advance(2000);
    const activation = f.request("/api/desktop/activate", f.input);
    await expect(
      f.service.activate(
        { ...f.principal, grantType: "refresh_token" },
        activation.raw,
        activation.proof,
      ),
    ).rejects.toMatchObject({ code: "session_revoked" });
    await expect(
      f.service.activate(f.principal, activation.raw, activation.proof),
    ).rejects.toMatchObject({ reason: "device_revoked" });
    const fresh = {
      ...f.principal,
      issuedAt: Math.floor(f.now().getTime() / 1000),
      jwtId: randomUUID(),
    };
    expect(
      (await f.service.activate(fresh, activation.raw, activation.proof)).activationId,
    ).not.toBe(f.activation.activationId);
  });
  it("rolls back a second device when the same approval is reused for another activation", async () => {
    const f = await fixture();
    const key = generateKeyPairSync("ed25519");
    const second = {
      ...f.input,
      deviceId: randomUUID(),
      publicKeySpki: key.publicKey.export({ type: "spki", format: "der" }).toString("base64"),
    };
    const request = f.request("/api/desktop/activate", second, null, key.privateKey);
    await expect(f.service.activate(f.principal, request.raw, request.proof)).rejects.toMatchObject(
      { code: "session_revoked" },
    );
    const activations = await db
      .select()
      .from(ediActivations)
      .innerJoin(ediDevices, eq(ediDevices.id, ediActivations.deviceId))
      .where(eq(ediDevices.userId, f.principal.userId));
    expect(activations).toHaveLength(1);
  });
});
