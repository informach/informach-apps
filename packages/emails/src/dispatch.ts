import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Database } from "@informach/db";
import { emailDeliveries } from "@informach/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { ZodError } from "zod";
import type { Logger } from "./logger";
import { classifySendgridError, nextAttemptDelaySeconds, type SendgridErrorLike } from "./retry";
import { SendEmailInputSchema } from "./schemas";

export type EmailCategory =
  | "auth.verify-email"
  | "auth.password-reset"
  | "auth.magic-link"
  | "auth.invitation"
  | "auth.account-deletion";

export type EmailAddress = string;

export type DispatchInput = {
  to: EmailAddress;
  subject: string;
  html?: string;
  text?: string;
  from?: EmailAddress;
  category: EmailCategory;
  messageKey: string;
  unsubscribeUrl: string;
  unsubscribeMailto?: string;
  userId?: string;
};

export type SendgridMessage = {
  to: string;
  from: string;
  subject: string;
  text?: string;
  html?: string;
  headers?: Record<string, string>;
  customArgs?: Record<string, string>;
  categories?: string[];
};

export type SendFn = (msg: SendgridMessage) => Promise<{ messageId?: string }>;

export type DispatchMode = "live" | "sandbox" | "memory";

export type MemoryOutboxEntry = {
  id: string;
  to: string;
  from: string;
  subject: string;
  category: EmailCategory;
  messageKey: string;
  userId?: string;
  headers: Record<string, string>;
  customArgs: Record<string, string>;
  categories: string[];
  html?: string;
  text?: string;
};

export type MemoryOutbox = {
  push: (entry: MemoryOutboxEntry) => void;
  list: () => readonly MemoryOutboxEntry[];
  clear: () => void;
};

export type DispatchDeps = {
  db: Database;
  defaultFrom: EmailAddress;
  mode: DispatchMode;
  sandboxDir: string;
  send: SendFn;
  outbox?: MemoryOutbox;
  logger?: Logger;
  /** Sleep used between retry attempts (injectable for tests). */
  sleep?: (ms: number) => Promise<void>;
  /** RNG for jitter (injectable for tests). */
  rng?: () => number;
  /** Number of inline send attempts on transient errors. Default 3. */
  inlineRetryAttempts?: number;
};

export type DispatchResult =
  | { ok: true; status: "sent" | "already-sent"; deliveryId: string }
  | { ok: false; status: "failed"; deliveryId: string; reason: string }
  | { ok: false; status: "skipped"; deliveryId: string; reason: string };

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function buildListUnsubscribeHeaders(url: string, mailto?: string): Record<string, string> {
  const parts = [`<${url}>`];
  if (mailto) parts.push(`<mailto:${mailto}>`);
  return {
    "List-Unsubscribe": parts.join(", "),
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

async function writeSandboxFile(
  dir: string,
  delivery: { id: string },
  input: DispatchInput,
  fromAddress: string,
  headers: Record<string, string>,
): Promise<void> {
  await mkdir(dir, { recursive: true });
  const meta = {
    id: delivery.id,
    to: input.to,
    from: fromAddress,
    subject: input.subject,
    category: input.category,
    messageKey: input.messageKey,
    userId: input.userId,
    headers,
    text: input.text ?? null,
  };
  await writeFile(join(dir, `${delivery.id}.json`), JSON.stringify(meta, null, 2), "utf8");
  if (input.html) {
    await writeFile(join(dir, `${delivery.id}.html`), input.html, "utf8");
  }
}

export async function dispatchEmail(
  deps: DispatchDeps,
  input: DispatchInput,
): Promise<DispatchResult> {
  try {
    SendEmailInputSchema.parse(input);
  } catch (error) {
    if (error instanceof ZodError) {
      const issue = error.issues[0];
      const path = issue?.path.join(".") || "input";
      throw new Error(`dispatchEmail: invalid ${path}: ${issue?.message ?? "validation error"}`, {
        cause: error,
      });
    }
    throw error;
  }

  const sleep = deps.sleep ?? defaultSleep;
  const rng = deps.rng ?? Math.random;
  const inlineAttempts = Math.max(1, deps.inlineRetryAttempts ?? 3);

  const id = crypto.randomUUID();
  const now = new Date();

  const inserted = await deps.db
    .insert(emailDeliveries)
    .values({
      id,
      recipient: input.to,
      category: input.category,
      messageKey: input.messageKey,
      subject: input.subject,
      html: input.html ?? null,
      text: input.text ?? null,
      status: "pending",
      userId: input.userId,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({
      target: [emailDeliveries.category, emailDeliveries.messageKey],
    })
    .returning();

  let delivery = inserted[0];
  if (!delivery) {
    const existing = await deps.db
      .select()
      .from(emailDeliveries)
      .where(
        and(
          eq(emailDeliveries.category, input.category),
          eq(emailDeliveries.messageKey, input.messageKey),
        ),
      )
      .limit(1);
    delivery = existing[0];
    if (!delivery) {
      throw new Error("dispatchEmail: failed to insert and no existing row found");
    }
    if (delivery.status === "sent") {
      return { ok: true, status: "already-sent", deliveryId: delivery.id };
    }
  }

  const claimed = await deps.db
    .update(emailDeliveries)
    .set({
      status: "sending",
      sendingStartedAt: new Date(),
      sendAttempts: sql`${emailDeliveries.sendAttempts} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(emailDeliveries.id, delivery.id),
        inArray(emailDeliveries.status, ["pending", "failed"]),
      ),
    )
    .returning();

  const claimedRow = claimed[0];
  if (!claimedRow) {
    return {
      ok: false,
      status: "skipped",
      deliveryId: delivery.id,
      reason: "claimed by another process",
    };
  }
  delivery = claimedRow;

  const fromAddress = input.from ?? deps.defaultFrom;
  const headers = buildListUnsubscribeHeaders(input.unsubscribeUrl, input.unsubscribeMailto);
  const customArgs: Record<string, string> = {
    delivery_id: delivery.id,
    category: input.category,
    ...(input.userId ? { user_id: input.userId } : {}),
  };

  if (deps.mode === "sandbox") {
    await writeSandboxFile(deps.sandboxDir, delivery, input, fromAddress, headers);
    await deps.db
      .update(emailDeliveries)
      .set({
        status: "sent",
        providerAccepted: true,
        providerMessageId: `sandbox-${delivery.id}`,
        sentAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(emailDeliveries.id, delivery.id));
    return { ok: true, status: "sent", deliveryId: delivery.id };
  }

  if (deps.mode === "memory") {
    deps.outbox?.push({
      id: delivery.id,
      to: input.to,
      from: fromAddress,
      subject: input.subject,
      category: input.category,
      messageKey: input.messageKey,
      ...(input.userId ? { userId: input.userId } : {}),
      headers,
      customArgs,
      categories: [input.category],
      ...(input.html ? { html: input.html } : {}),
      ...(input.text ? { text: input.text } : {}),
    });
    await deps.db
      .update(emailDeliveries)
      .set({
        status: "sent",
        providerAccepted: true,
        providerMessageId: `memory-${delivery.id}`,
        sentAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(emailDeliveries.id, delivery.id));
    return { ok: true, status: "sent", deliveryId: delivery.id };
  }

  const message: SendgridMessage = {
    to: input.to,
    from: fromAddress,
    subject: input.subject,
    ...(input.text ? { text: input.text } : {}),
    ...(input.html ? { html: input.html } : {}),
    headers,
    customArgs,
    categories: [input.category],
  };

  let lastError: string | undefined;
  let lastClassification: "permanent" | "transient" = "transient";

  for (let attempt = 1; attempt <= inlineAttempts; attempt++) {
    try {
      const { messageId } = await deps.send(message);
      await deps.db
        .update(emailDeliveries)
        .set({
          status: "sent",
          providerAccepted: true,
          providerMessageId: messageId ?? null,
          sentAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(emailDeliveries.id, delivery.id));
      return { ok: true, status: "sent", deliveryId: delivery.id };
    } catch (error: unknown) {
      const errLike = error as SendgridErrorLike;
      lastClassification = classifySendgridError(errLike);
      lastError = errLike.message ?? `SendGrid error (status ${errLike.response?.statusCode})`;

      if (lastClassification === "permanent") {
        deps.logger?.error?.("Email delivery permanently failed", {
          deliveryId: delivery.id,
          attempt,
          status: errLike.response?.statusCode,
          reason: lastError,
        });
        break;
      }

      deps.logger?.debug?.("Email delivery transient failure", {
        deliveryId: delivery.id,
        attempt,
        status: errLike.response?.statusCode,
        reason: lastError,
      });

      if (attempt < inlineAttempts) {
        const delayMs = nextAttemptDelaySeconds(attempt, rng) * 1000;
        await sleep(delayMs);
      }
    }
  }

  await deps.db
    .update(emailDeliveries)
    .set({
      status: "failed",
      lastError: lastError ?? "unknown send failure",
      updatedAt: new Date(),
    })
    .where(eq(emailDeliveries.id, delivery.id));

  return {
    ok: false,
    status: "failed",
    deliveryId: delivery.id,
    reason: lastError ?? "unknown send failure",
  };
}
