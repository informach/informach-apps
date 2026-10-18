import { randomBytes, randomUUID } from "node:crypto";
import { db } from "@informach/db";
import { users, verifications } from "@informach/db/schema";
import { eq, like } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { z } from "zod/v4";
import { createAuth } from "./index";

describe("email verification recovery against the real auth handler", () => {
  it("requires verification, expires codes, resends, rejects invalid codes and confirms", async () => {
    if (process.env.EDI_ISOLATED_DATABASE !== "1")
      throw new Error("Disposable PostgreSQL required");
    let latestCode = "";
    const baseUrl = "http://localhost:3006";
    const { auth } = createAuth({
      appName: "OTP integration",
      baseUrl,
      secret: randomBytes(32).toString("hex"),
      trustedOrigins: [baseUrl],
      email: { verification: "otp", signIn: { magicLink: false }, forgetPassword: "otp" },
      renderTemplate: async (_category, data) => {
        latestCode = z.object({ otp: z.string() }).parse(data).otp;
        return { html: "test", text: "test", subject: "test" };
      },
      sendEmail: async () => ({ ok: true, status: "sent", deliveryId: randomUUID() }),
      buildUnsubscribeUrl: () => `${baseUrl}/unsubscribe`,
    });
    const email = `${randomUUID()}@example.test`;
    const password = randomBytes(24).toString("hex");
    const post = (path: string, body: unknown) =>
      auth.handler(
        new Request(`${baseUrl}/api/auth${path}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: baseUrl,
            "X-Real-IP": "127.0.0.243",
          },
          body: JSON.stringify(body),
        }),
      );
    expect((await post("/sign-up/email", { email, password, name: "Pending" })).status).toBe(200);
    const signin = await post("/sign-in/email", { email, password });
    expect(signin.status).toBe(403);
    expect(await signin.json()).toMatchObject({ code: "EMAIL_NOT_VERIFIED" });
    expect(latestCode).toMatch(/^\d{6}$/);
    await db
      .update(verifications)
      .set({ expiresAt: new Date(0) })
      .where(like(verifications.identifier, `%${email}%`));
    expect(
      (await post("/email-otp/verify-email", { email, otp: latestCode })).status,
    ).toBeGreaterThanOrEqual(400);
    expect(
      (await post("/email-otp/send-verification-otp", { email, type: "email-verification" }))
        .status,
    ).toBe(200);
    expect(
      (await post("/email-otp/verify-email", { email, otp: "invalid" })).status,
    ).toBeGreaterThanOrEqual(400);
    expect((await db.select().from(users).where(eq(users.email, email)))[0]?.emailVerified).toBe(
      false,
    );
    const resendStatuses: number[] = [];
    for (let attempt = 0; attempt < 5; attempt++) {
      const response = await post("/email-otp/send-verification-otp", {
        email,
        type: "email-verification",
      });
      resendStatuses.push(response.status);
    }
    expect(resendStatuses).toContain(200);
    expect(resendStatuses.at(-1)).toBe(429);
    expect((await post("/email-otp/verify-email", { email, otp: latestCode })).status).toBe(200);
    expect((await db.select().from(users).where(eq(users.email, email)))[0]?.emailVerified).toBe(
      true,
    );
    expect((await post("/sign-in/email", { email, password })).status).toBe(200);
  });
});
