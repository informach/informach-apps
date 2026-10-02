import { randomUUID } from "node:crypto";
import { db, eq } from "@informach/db";
import { emailDeliveries, users } from "@informach/db/schema";
import { dispatchEmail } from "@informach/emails";
import { afterAll, expect, it, vi } from "vitest";
import { emails } from "@/lib/emails";
import { env } from "@/lib/env";
import { packageLogger } from "@/lib/observability";

const owner = randomUUID();
const recipient = `${owner}@example.test`;

afterAll(async () => {
  vi.restoreAllMocks();
  await db.delete(emailDeliveries).where(eq(emailDeliveries.recipient, recipient));
  await db.delete(users).where(eq(users.id, owner));
});

it("alerta falha no reset sem revelar a existência da conta nem persistir o código", async () => {
  await db.insert(users).values({
    id: owner,
    email: recipient,
    name: "Revisão de auth",
    emailVerified: true,
  });
  const send = vi.fn(async () => {
    throw Object.assign(new Error("temporary provider outage"), {
      response: { statusCode: 503 },
    });
  });
  const errors = vi.spyOn(packageLogger, "error");
  vi.spyOn(emails, "sendEmail").mockImplementation((input) =>
    dispatchEmail(
      {
        db,
        defaultFrom: env.SENDGRID_FROM,
        mode: "live",
        sandboxDir: "tmp",
        send,
        logger: packageLogger,
        inlineRetryAttempts: 1,
      },
      input,
    ),
  );
  const { auth } = await import("@/lib/auth");
  const statuses = [];
  for (const email of [recipient, `${randomUUID()}@example.test`]) {
    const response = await auth.handler(
      new Request(`${env.BETTER_AUTH_URL}/api/auth/email-otp/request-password-reset`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: env.BETTER_AUTH_URL },
        body: JSON.stringify({ email }),
      }),
    );
    statuses.push(response.status);
    expect(await response.json()).toEqual({ success: true });
  }
  expect(statuses).toEqual([200, 200]);
  expect(send).toHaveBeenCalledTimes(1);
  const [delivery] = await db
    .select()
    .from(emailDeliveries)
    .where(eq(emailDeliveries.recipient, recipient));
  expect(delivery).toMatchObject({ status: "failed", html: null, text: null });
  expect(errors).toHaveBeenCalledTimes(1);
  expect(errors).toHaveBeenCalledWith("Email delivery inline retries exhausted", {
    deliveryId: delivery?.id,
    category: "auth.forget-password-otp",
    classification: "transient",
    attempts: 1,
  });
});
