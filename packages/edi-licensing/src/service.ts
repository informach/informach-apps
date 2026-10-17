import type { Database } from "@informach/db";
import {
  customers,
  ediActivations,
  ediDeviceSessions,
  ediDevices,
  ediEntitlements,
  ediRequestNonces,
  subscriptionPaymentPeriods,
  subscriptions,
  users,
} from "@informach/db/schema";
import {
  activationRequestSchema,
  DEVICE_CODE_GRANT,
  type LicenseResponse,
  licenseRequestSchema,
  logoutRequestSchema,
} from "@informach/edi-contracts";
import { type RequestProof, verifyRequestProof } from "@informach/edi-contracts/proof";
import { and, desc, eq, gt, inArray, isNull } from "drizzle-orm";
import { activateDevice, revokeDevice } from "./devices";
import { type AccessDecision, decideAccess } from "./policy";
import type { createLicenseSigner } from "./sign";

export type DesktopPrincipal = {
  userId: string;
  jwtId: string;
  issuedAt: number;
  grantType: string;
};
export class DesktopAccessError extends Error {
  constructor(readonly code: "invalid_proof" | "session_revoked" | "device_revoked") {
    super(code);
    this.name = "DesktopAccessError";
  }
}
export class EntitlementUnavailableError extends Error {
  constructor() {
    super("Billing reconciliation unavailable or stale");
    this.name = "EntitlementUnavailableError";
  }
}
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
async function consumeProof(db: Database | Transaction, proof: RequestProof, now: Date) {
  const inserted = await db
    .insert(ediRequestNonces)
    .values({
      nonce: proof.nonce,
      userId: proof.userId,
      expiresAt: new Date(now.getTime() + 300000),
    })
    .onConflictDoNothing()
    .returning({ nonce: ediRequestNonces.nonce });
  if (!inserted[0]) throw new DesktopAccessError("invalid_proof");
}
export async function accountAccess(
  db: Database | Transaction,
  userId: string,
  now: Date,
  options: { requireFresh?: boolean } = {},
): Promise<AccessDecision> {
  const projection = await db
    .select()
    .from(ediEntitlements)
    .where(eq(ediEntitlements.userId, userId))
    .limit(1);
  if (projection[0]?.suspended) return { allowed: false, reason: "suspended" };
  const rows = await db
    .select({ subscription: subscriptions })
    .from(subscriptions)
    .innerJoin(customers, eq(customers.id, subscriptions.customerId))
    .where(
      and(
        eq(customers.app, "edi"),
        eq(customers.subjectType, "user"),
        eq(customers.subjectId, userId),
        eq(subscriptions.provider, "stripe"),
        inArray(subscriptions.productId, ["edi_suite_monthly", "edi_suite_annual"]),
      ),
    )
    .orderBy(desc(subscriptions.createdAt))
    .limit(10);
  const current = projection[0];
  if (
    options.requireFresh &&
    rows.length &&
    (!current || now.getTime() - current.reconciledAt.getTime() > 86400000)
  )
    throw new EntitlementUnavailableError();
  // The projection is rebuilt from the complete current provider catalog. A removed
  // or unknown price must not inherit an older, still-paid local subscription.
  if (current && (!current.paidThrough || current.paidThrough <= now))
    return { allowed: false, reason: "payment_required" };
  let denial: AccessDecision = { allowed: false, reason: "subscription_required" };
  for (const { subscription } of rows) {
    const periods = await db
      .select()
      .from(subscriptionPaymentPeriods)
      .where(
        and(
          eq(subscriptionPaymentPeriods.subscriptionId, subscription.id),
          gt(subscriptionPaymentPeriods.periodEnd, now),
        ),
      )
      .limit(600);
    const decision = decideAccess(
      {
        status: subscription.status,
        trialEnd: subscription.trialEnd,
        suspended: false,
        periods: periods.map((period) => ({
          start: period.periodStart,
          end: period.periodEnd,
          refunded: period.fullyRefunded,
          disputed: period.disputed,
        })),
      },
      now,
    );
    if (decision.allowed)
      return current?.paidThrough
        ? {
            ...decision,
            paidThrough: new Date(
              Math.min(decision.paidThrough.getTime(), current.paidThrough.getTime()),
            ),
          }
        : decision;
    if (decision.reason === "suspended") return decision;
    if (decision.reason === "payment_required") denial = decision;
  }
  return denial;
}

export function createDesktopLicenseService(config: {
  db: Database;
  audience: string;
  sign: ReturnType<typeof createLicenseSigner>;
  now?: () => Date;
}) {
  const { db } = config;
  const clock = config.now ?? (() => new Date());
  function proof(
    raw: string,
    header: string,
    spki: string,
    principal: DesktopPrincipal,
    deviceId: string,
    sessionId: string | null,
    path: RequestProof["path"],
    now: Date,
  ) {
    const result = verifyRequestProof(
      header,
      raw,
      spki,
      {
        audience: config.audience,
        method: "POST",
        path,
        userId: principal.userId,
        deviceId,
        sessionId,
      },
      now,
    );
    if (!result) throw new DesktopAccessError("invalid_proof");
    return result;
  }
  async function deviceSession(userId: string, deviceId: string, sessionId: string) {
    const rows = await db
      .select({ device: ediDevices, activation: ediActivations, session: ediDeviceSessions })
      .from(ediDevices)
      .innerJoin(ediActivations, eq(ediActivations.deviceId, ediDevices.id))
      .innerJoin(ediDeviceSessions, eq(ediDeviceSessions.activationId, ediActivations.id))
      .where(
        and(
          eq(ediDevices.id, deviceId),
          eq(ediDevices.userId, userId),
          eq(ediDeviceSessions.id, sessionId),
        ),
      )
      .limit(1);
    const row = rows[0];
    if (!row) throw new DesktopAccessError("session_revoked");
    return row;
  }
  return {
    async activate(principal: DesktopPrincipal, raw: string, header: string) {
      const now = clock();
      if (principal.grantType !== DEVICE_CODE_GRANT)
        throw new DesktopAccessError("session_revoked");
      const input = activationRequestSchema.parse(JSON.parse(raw));
      const verified = proof(
        raw,
        header,
        input.publicKeySpki,
        principal,
        input.deviceId,
        null,
        "/api/desktop/activate",
        now,
      );
      return db.transaction(async (tx) => {
        await consumeProof(tx, verified, now);
        const activation = await activateDevice(tx, principal.userId, input, now, {
          issuedAt: principal.issuedAt,
        });
        const expiresAt = new Date(now.getTime() + 30 * 86400000);
        const sessions = await tx
          .insert(ediDeviceSessions)
          .values({
            activationId: activation.id,
            oauthGrantId: principal.jwtId,
            expiresAt,
            createdAt: now,
          })
          .onConflictDoNothing({ target: ediDeviceSessions.oauthGrantId })
          .returning();
        const existing =
          sessions[0] ??
          (
            await tx
              .select()
              .from(ediDeviceSessions)
              .where(
                and(
                  eq(ediDeviceSessions.oauthGrantId, principal.jwtId),
                  eq(ediDeviceSessions.activationId, activation.id),
                  isNull(ediDeviceSessions.revokedAt),
                ),
              )
              .limit(1)
          )[0];
        if (!existing) throw new DesktopAccessError("session_revoked");
        const device = (
          await tx.select().from(ediDevices).where(eq(ediDevices.id, input.deviceId)).limit(1)
        )[0];
        if (!device) throw new Error("Activated device missing");
        return {
          userId: principal.userId,
          deviceId: device.id,
          activationId: activation.id,
          sessionId: existing.id,
          keyThumbprint: device.keyThumbprint,
          expiresAt: existing.expiresAt.toISOString(),
          serverTime: now.getTime(),
        };
      });
    },
    async license(
      principal: DesktopPrincipal,
      raw: string,
      header: string,
    ): Promise<LicenseResponse> {
      const now = clock();
      const input = licenseRequestSchema.parse(JSON.parse(raw));
      const binding = await deviceSession(principal.userId, input.deviceId, input.sessionId);
      const verified = proof(
        raw,
        header,
        binding.device.publicKeySpki,
        principal,
        input.deviceId,
        input.sessionId,
        "/api/desktop/license",
        now,
      );
      return db.transaction(async (tx) => {
        const user = (
          await tx
            .select({ banned: users.banned, banExpiresAt: users.banExpiresAt })
            .from(users)
            .where(eq(users.id, principal.userId))
            .for("update")
        )[0];
        await consumeProof(tx, verified, now);
        const current = (
          await tx
            .select({ activation: ediActivations, session: ediDeviceSessions })
            .from(ediActivations)
            .innerJoin(ediDeviceSessions, eq(ediDeviceSessions.activationId, ediActivations.id))
            .where(
              and(
                eq(ediActivations.id, binding.activation.id),
                eq(ediDeviceSessions.id, input.sessionId),
              ),
            )
            .limit(1)
        )[0];
        if (!user || !current || current.session.revokedAt || current.session.expiresAt <= now)
          return { status: "denied", reason: "session_revoked", serverTime: now.getTime() };
        if (current.activation.revokedAt)
          return { status: "denied", reason: "device_revoked", serverTime: now.getTime() };
        if (user.banned && (!user.banExpiresAt || user.banExpiresAt > now))
          return { status: "denied", reason: "suspended", serverTime: now.getTime() };
        const decision = await accountAccess(tx, principal.userId, now, { requireFresh: true });
        if (!decision.allowed)
          return { status: "denied", reason: decision.reason, serverTime: now.getTime() };
        const lease = config.sign({
          sub: principal.userId,
          deviceId: binding.device.id,
          keyThumbprint: binding.device.keyThumbprint,
          activationId: current.activation.id,
          revision: current.activation.revision,
          now,
          paidThrough: decision.paidThrough,
        });
        return { status: "granted", lease, serverTime: now.getTime() };
      });
    },
    async logout(principal: DesktopPrincipal, raw: string, header: string) {
      const now = clock();
      const input = logoutRequestSchema.parse(JSON.parse(raw));
      const binding = await deviceSession(principal.userId, input.deviceId, input.sessionId);
      const verified = proof(
        raw,
        header,
        binding.device.publicKeySpki,
        principal,
        input.deviceId,
        input.sessionId,
        "/api/desktop/logout",
        now,
      );
      await db.transaction(async (tx) => {
        await consumeProof(tx, verified, now);
        await revokeDevice(tx, principal.userId, input.deviceId, now);
      });
    },
  };
}
