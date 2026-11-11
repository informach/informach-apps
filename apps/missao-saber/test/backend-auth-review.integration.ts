import { randomUUID } from "node:crypto";
import { db, eq } from "@informach/db";
import { emailDeliveries, users } from "@informach/db/schema";
import { afterAll, expect, it } from "vitest";
import { emails } from "@/lib/emails";
import { env } from "@/lib/env";

const owner = randomUUID();
const recipient = `${owner}@example.test`;
afterAll(async () => {
  emails.clearOutbox();
  await db.delete(emailDeliveries).where(eq(emailDeliveries.recipient, recipient));
  await db.update(users).set({ banned: true, emailVerified: false }).where(eq(users.id, owner));
});
it("does not issue local reset credentials or reveal whether a central account exists", async () => {
  await db
    .insert(users)
    .values({ id: owner, email: recipient, name: "Central account", emailVerified: true });
  const { auth } = await import("@/lib/auth");
  const responses = [];
  for (const email of [recipient, `${randomUUID()}@example.test`]) {
    const response = await auth.handler(
      new Request(`${env.BETTER_AUTH_URL}/api/auth/email-otp/request-password-reset`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: env.BETTER_AUTH_URL },
        body: JSON.stringify({ email }),
      }),
    );
    responses.push({ status: response.status, body: await response.text() });
  }
  expect(responses[0]).toEqual(responses[1]);
  expect(responses[0]?.status).toBe(404);
  expect(emails.getOutbox().filter((message) => message.to === recipient)).toEqual([]);
  expect(
    await db.select().from(emailDeliveries).where(eq(emailDeliveries.recipient, recipient)),
  ).toEqual([]);
});
