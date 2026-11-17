import { randomBytes, randomUUID } from "node:crypto";
import { db, eq } from "@informach/db";
import {
  familyGroups,
  familyInvitations,
  sessions,
  users,
  verifications,
} from "@informach/db/schema";
import { beforeAll, describe, expect, it } from "vitest";
import { createAuth } from "./index";

const origin = "http://localhost:3011";
const deliveries = new Map<string, string>();
let auth: ReturnType<typeof createAuth>["auth"];
const cookies = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
function request(path: string, body?: Record<string, unknown>, cookie = "") {
  return auth.handler(
    new Request(`${origin}/api/auth${path}`, {
      method: body ? "POST" : "GET",
      headers: { "Content-Type": "application/json", Origin: origin, Cookie: cookie },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
  );
}
async function account() {
  const email = `${randomUUID()}@example.test`;
  const password = randomBytes(20).toString("hex");
  expect((await request("/sign-up/email", { email, password, name: "Email change" })).status).toBe(
    200,
  );
  const [user] = await db
    .update(users)
    .set({ emailVerified: true })
    .where(eq(users.email, email))
    .returning();
  if (!user) throw new Error("Missing synthetic account");
  const response = await request("/sign-in/email", { email, password });
  expect(response.status).toBe(200);
  return { user, password, cookie: cookies(response) };
}
async function oldCode(email: string, cookie: string) {
  expect(
    (
      await request(
        "/email-otp/send-verification-otp",
        { email, type: "email-verification" },
        cookie,
      )
    ).status,
  ).toBe(200);
  const code = deliveries.get(`auth.verify-email-otp:${email}`);
  if (!code) throw new Error("Missing current-address proof");
  return code;
}
beforeAll(() => {
  const host = new URL(process.env.DATABASE_URL ?? "").hostname;
  if (
    process.env.COMPASSO_ISOLATED_DATABASE !== "1" ||
    !["localhost", "127.0.0.1", "postgres"].includes(host)
  )
    throw new Error("Disposable PostgreSQL required");
  auth = createAuth({
    appName: "Email change integration",
    baseUrl: origin,
    secret: process.env.BETTER_AUTH_SECRET ?? randomBytes(32).toString("hex"),
    trustedOrigins: [origin],
    webSso: { role: "provider", environment: "development" },
    email: { verification: "otp", forgetPassword: "otp", signIn: { magicLink: false } },
    renderTemplate: async (_category, data) => ({
      html: "Synthetic email",
      text: "otp" in data ? String(data.otp) : "",
      subject: "Synthetic email",
    }),
    sendEmail: async (message) => {
      deliveries.set(`${message.category}:${message.to}`, message.text ?? "");
      return { ok: true, status: "sent", deliveryId: randomUUID() };
    },
    buildUnsubscribeUrl: () => `${origin}/unsubscribe`,
    rateLimitRules: {
      "/sign-up/email": { window: 60, max: 100 },
      "/sign-in/email": { window: 60, max: 100 },
      "/email-otp/send-verification-otp": { window: 60, max: 100 },
      "/email-otp/request-email-change": { window: 60, max: 100 },
      "/email-otp/change-email": { window: 60, max: 100 },
    },
  }).auth;
});

describe("central verified email change", () => {
  it("requires both addresses, preserves identity and revokes web access atomically", async () => {
    const owner = await account();
    const newEmail = `${randomUUID()}@example.test`;
    const second = await request("/sign-in/email", {
      email: owner.user.email,
      password: owner.password,
    });
    const root = await (await request("/get-session", undefined, cookies(second))).json();
    const childId = randomUUID();
    const independentId = randomUUID();
    const [group] = await db
      .insert(familyGroups)
      .values({ name: "Pending invitation" })
      .returning();
    if (!group) throw new Error("Missing synthetic group");
    const [invite] = await db
      .insert(familyInvitations)
      .values({
        groupId: group.id,
        invitedBy: owner.user.id,
        email: owner.user.email,
        tokenHash: randomBytes(32).toString("hex"),
        expiresAt: new Date(Date.now() + 3600000),
      })
      .returning();
    if (!invite) throw new Error("Missing synthetic invitation");
    await db.insert(sessions).values([
      {
        id: childId,
        userId: owner.user.id,
        token: randomUUID(),
        originApp: "cozya",
        parentSessionId: root.session.id,
        expiresAt: new Date(Date.now() + 3600000),
      },
      {
        id: independentId,
        userId: owner.user.id,
        token: randomUUID(),
        expiresAt: new Date(Date.now() + 3600000),
      },
    ]);
    const staleRecovery = `forget-password-otp-${owner.user.email}`;
    await db.insert(verifications).values({
      id: randomUUID(),
      identifier: staleRecovery,
      value: "synthetic-unusable-proof",
      expiresAt: new Date(Date.now() + 3600000),
    });
    expect(
      (await request("/email-otp/request-email-change", { newEmail }, owner.cookie)).status,
    ).toBeGreaterThanOrEqual(400);
    const currentOtp = await oldCode(owner.user.email, owner.cookie);
    expect(
      (await request("/email-otp/request-email-change", { newEmail, otp: "invalid" }, owner.cookie))
        .status,
    ).toBeGreaterThanOrEqual(400);
    const requested = await request(
      "/email-otp/request-email-change",
      { newEmail, otp: currentOtp },
      owner.cookie,
    );
    expect(requested.status, await requested.clone().text()).toBe(200);
    const newOtp = deliveries.get(`auth.change-email-otp:${newEmail}`);
    expect(newOtp).toMatch(/^\d{6}$/);
    expect((await db.select().from(users).where(eq(users.id, owner.user.id)))[0]?.email).toBe(
      owner.user.email,
    );
    expect(
      (await request("/email-otp/change-email", { newEmail, otp: "invalid" }, owner.cookie)).status,
    ).toBeGreaterThanOrEqual(400);
    const changed = await request(
      "/email-otp/change-email",
      { newEmail, otp: newOtp },
      owner.cookie,
    );
    expect(changed.status, await changed.clone().text()).toBe(200);
    expect((await db.select().from(users).where(eq(users.id, owner.user.id)))[0]).toMatchObject({
      email: newEmail,
      emailVerified: true,
      id: owner.user.id,
    });
    const remaining = await db
      .select({ id: sessions.id })
      .from(sessions)
      .where(eq(sessions.userId, owner.user.id));
    expect(remaining).toEqual([{ id: independentId }]);
    expect(
      (await db.select().from(familyInvitations).where(eq(familyInvitations.id, invite.id)))[0]
        ?.revokedAt,
    ).toBeInstanceOf(Date);
    expect(
      await db.select().from(verifications).where(eq(verifications.identifier, staleRecovery)),
    ).toHaveLength(0);
    expect(await (await request("/get-session", undefined, owner.cookie)).json()).toBeNull();
    expect(
      (await request("/sign-in/email", { email: owner.user.email, password: owner.password }))
        .status,
    ).toBeGreaterThanOrEqual(400);
    const newLogin = await request("/sign-in/email", { email: newEmail, password: owner.password });
    expect(newLogin.status).toBe(200);
    expect(
      (
        await request(
          "/email-otp/change-email",
          { newEmail: `${randomUUID()}@example.test`, otp: newOtp },
          cookies(newLogin),
        )
      ).status,
    ).toBeGreaterThanOrEqual(400);
  });

  it("refuses stale authentication and rolls back session revocation with the identity update", async () => {
    const owner = await account();
    const newEmail = `${randomUUID()}@example.test`;
    const otp = await oldCode(owner.user.email, owner.cookie);
    await db
      .update(sessions)
      .set({ createdAt: new Date(Date.now() - 3600000) })
      .where(eq(sessions.userId, owner.user.id));
    const stale = await request("/email-otp/request-email-change", { newEmail, otp }, owner.cookie);
    expect(stale.status).toBe(401);
    expect(await stale.json()).toMatchObject({ code: "RECENT_AUTHENTICATION_REQUIRED" });
    await expect(
      db.transaction(async (tx) => {
        await tx.update(users).set({ email: newEmail }).where(eq(users.id, owner.user.id));
        throw new Error("Synthetic rollback");
      }),
    ).rejects.toThrow("Synthetic rollback");
    expect((await db.select().from(users).where(eq(users.id, owner.user.id)))[0]?.email).toBe(
      owner.user.email,
    );
    expect(await db.select().from(sessions).where(eq(sessions.userId, owner.user.id))).toHaveLength(
      1,
    );
  });
});
