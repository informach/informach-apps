import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Database } from "@informach/db";
import { emailDeliveries } from "@informach/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { ZodError } from "zod";
import { type EmailAuditHook, emitEmailAudit } from "./audit";
import {
  describeDeliveryBlockReason,
  findDeliveryBlockReason,
  markDeliveryBlocked,
} from "./delivery-policy";
import { type Logger, safeLog } from "./logger";
import {
  classifySendgridError,
  MAX_ATTEMPTS,
  nextAttemptDelaySeconds,
  type SendgridErrorLike,
} from "./retry";
import { SendEmailInputSchema } from "./schemas";

export type EmailCategory =
  | "admin.alert"
  | "admin.weekly-summary"
  | "agenda.routine"
  | "auth.verify-email"
  | "auth.verify-email-otp"
  | "auth.sign-in-otp"
  | "auth.forget-password-otp"
  | "auth.password-reset"
  | "auth.magic-link"
  | "auth.invitation"
  | "auth.account-deletion"
  | "auth.signup-attempt-on-existing"
  | "auth.two-factor-setup-otp"
  | "billing.payment-success"
  | "billing.payment-failed"
  | "billing.subscription-renewed"
  | "billing.subscription-canceled"
  | "billing.credits-purchased"
  | "billing.credits-warning"
  | "missao.weekly-report"
  | "bora.reminder"
  | "bora.weekly-summary";

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
  onAudit?: EmailAuditHook;
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
  | { ok: false; status: "skipped"; deliveryId: string; reason: string }
  | { ok: false; status: "deferred"; deliveryId: string; reason: "in-flight" | "outcome-unknown" };

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function shouldPersistBody(category: EmailCategory): boolean {
  // School reminders and the weekly study digest must be regenerated after
  // checking current access, status and consent. Persisting their bodies would
  // let a generic retry send outdated data about a child. Bastidores alerts and
  // summaries are rebuilt by their own job (same messageKey) from current
  // service state; a generic retry from another app would resend a stale alert.
  return (
    !category.startsWith("auth.") &&
    !category.startsWith("admin.") &&
    category !== "agenda.routine" &&
    category !== "missao.weekly-report" &&
    category !== "bora.reminder" &&
    category !== "bora.weekly-summary"
  );
}

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

async function providerAcceptanceArrived(db: Database, deliveryId: string): Promise<boolean> {
  const [delivery] = await db
    .select({ providerAccepted: emailDeliveries.providerAccepted })
    .from(emailDeliveries)
    .where(eq(emailDeliveries.id, deliveryId))
    .limit(1);
  if (!delivery?.providerAccepted) return false;
  await db
    .update(emailDeliveries)
    .set({
      status: sql<string>`case when ${emailDeliveries.status} = 'sending' then 'sent' else ${emailDeliveries.status} end`,
      lastError: sql<
        string | null
      >`case when ${emailDeliveries.status} = 'sending' then null else ${emailDeliveries.lastError} end`,
      nextAttemptAt: sql<Date | null>`case when ${emailDeliveries.status} = 'sending' then null else ${emailDeliveries.nextAttemptAt} end`,
      sentAt: sql<Date>`coalesce(${emailDeliveries.sentAt}, now())`,
      updatedAt: new Date(),
    })
    .where(eq(emailDeliveries.id, deliveryId));
  return true;
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
  const persistBody = shouldPersistBody(input.category);

  const inserted = await deps.db
    .insert(emailDeliveries)
    .values({
      id,
      recipient: input.to,
      category: input.category,
      messageKey: input.messageKey,
      fromAddress: input.from ?? deps.defaultFrom,
      unsubscribeUrl: persistBody ? input.unsubscribeUrl : null,
      unsubscribeMailto: persistBody ? (input.unsubscribeMailto ?? null) : null,
      subject: input.subject,
      // Auth email bodies contain OTPs or one-time links; keep them in process
      // only for the current send attempt and do not persist them for retries.
      html: persistBody ? (input.html ?? null) : null,
      text: persistBody ? (input.text ?? null) : null,
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
    if (delivery.status === "sent" || delivery.status === "delivered") {
      return { ok: true, status: "already-sent", deliveryId: delivery.id };
    }
    if (["dropped", "skipped", "bounced", "complained"].includes(delivery.status)) {
      return {
        ok: false,
        status: "skipped",
        deliveryId: delivery.id,
        reason: delivery.lastError ?? "delivery already skipped",
      };
    }
    if (delivery.providerAccepted) {
      await deps.db
        .update(emailDeliveries)
        .set({
          status: "sent",
          lastError: null,
          nextAttemptAt: null,
          sentAt: sql<Date>`coalesce(${emailDeliveries.sentAt}, now())`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(emailDeliveries.id, delivery.id),
            inArray(emailDeliveries.status, ["pending", "failed", "sending", "unknown"]),
            eq(emailDeliveries.providerAccepted, true),
          ),
        );
      return { ok: true, status: "already-sent", deliveryId: delivery.id };
    }
    if (delivery.status === "sending" || delivery.status === "unknown") {
      return {
        ok: false,
        status: "deferred",
        deliveryId: delivery.id,
        reason: delivery.status === "unknown" ? "outcome-unknown" : "in-flight",
      };
    }
  }

  const block = await findDeliveryBlockReason(deps.db, {
    recipient: input.to,
    category: input.category,
    userId: input.userId,
  });
  if (block) {
    const reason = describeDeliveryBlockReason(block);
    const marked = await markDeliveryBlocked(deps.db, delivery.id, block, ["pending", "failed"]);
    if (marked) {
      emitEmailAudit(deps, {
        eventType: "email.delivery_skipped",
        actorId: input.userId ?? null,
        payload: {
          deliveryId: delivery.id,
          category: input.category,
          reason,
        },
      });
    }
    if (!marked)
      return { ok: false, status: "deferred", deliveryId: delivery.id, reason: "in-flight" };
    return {
      ok: false,
      status: "skipped",
      deliveryId: delivery.id,
      reason,
    };
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
        eq(emailDeliveries.providerAccepted, false),
      ),
    )
    .returning();

  const claimedRow = claimed[0];
  if (!claimedRow) {
    return {
      ok: false,
      status: "deferred",
      deliveryId: delivery.id,
      reason: "in-flight",
    };
  }
  delivery = claimedRow;

  const fromAddress = input.from ?? deps.defaultFrom;
  const headers = buildListUnsubscribeHeaders(input.unsubscribeUrl, input.unsubscribeMailto);
  const customArgs: Record<string, string> = {
    delivery_id: delivery.id,
    informach_category: input.category,
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
        lastError: null,
        nextAttemptAt: null,
        sentAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(emailDeliveries.id, delivery.id));
    emitEmailAudit(deps, {
      eventType: "email.delivery_sent",
      actorId: input.userId ?? null,
      payload: {
        deliveryId: delivery.id,
        category: input.category,
        providerMessageId: `sandbox-${delivery.id}`,
        mode: "sandbox",
      },
    });
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
        lastError: null,
        nextAttemptAt: null,
        sentAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(emailDeliveries.id, delivery.id));
    emitEmailAudit(deps, {
      eventType: "email.delivery_sent",
      actorId: input.userId ?? null,
      payload: {
        deliveryId: delivery.id,
        category: input.category,
        providerMessageId: `memory-${delivery.id}`,
        mode: "memory",
      },
    });
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
    if (attempt > 1 && (await providerAcceptanceArrived(deps.db, delivery.id))) {
      return { ok: true, status: "sent", deliveryId: delivery.id };
    }
    try {
      const { messageId } = await deps.send(message);
      await deps.db
        .update(emailDeliveries)
        .set({
          status: sql<string>`case when ${emailDeliveries.status} = 'sending' then 'sent' else ${emailDeliveries.status} end`,
          providerAccepted: true,
          providerMessageId: sql<
            string | null
          >`coalesce(${emailDeliveries.providerMessageId}, ${messageId ?? null})`,
          lastError: sql<
            string | null
          >`case when ${emailDeliveries.status} = 'sending' then null else ${emailDeliveries.lastError} end`,
          nextAttemptAt: sql<Date | null>`case when ${emailDeliveries.status} = 'sending' then null else ${emailDeliveries.nextAttemptAt} end`,
          sentAt: sql<Date>`coalesce(${emailDeliveries.sentAt}, now())`,
          updatedAt: new Date(),
        })
        .where(eq(emailDeliveries.id, delivery.id));
      emitEmailAudit(deps, {
        eventType: "email.delivery_sent",
        actorId: input.userId ?? null,
        payload: {
          deliveryId: delivery.id,
          category: input.category,
          providerMessageId: messageId ?? null,
          mode: "live",
        },
      });
      return { ok: true, status: "sent", deliveryId: delivery.id };
    } catch (error: unknown) {
      const errLike = error as SendgridErrorLike;
      lastClassification = classifySendgridError(errLike);
      lastError = errLike.message ?? `SendGrid error (status ${errLike.response?.statusCode})`;

      if (await providerAcceptanceArrived(deps.db, delivery.id)) {
        emitEmailAudit(deps, {
          eventType: "email.delivery_sent",
          actorId: input.userId ?? null,
          payload: {
            deliveryId: delivery.id,
            category: input.category,
            providerMessageId: null,
            mode: "live-webhook-confirmed",
          },
        });
        return { ok: true, status: "sent", deliveryId: delivery.id };
      }

      if (lastClassification === "permanent") {
        safeLog(deps.logger, "error", "Email delivery permanently failed", {
          deliveryId: delivery.id,
          attempt,
          status: errLike.response?.statusCode,
          reason: lastError,
        });
        break;
      }

      safeLog(deps.logger, "debug", "Email delivery transient failure", {
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
      ...(lastClassification === "permanent" ? { sendAttempts: MAX_ATTEMPTS } : {}),
      lastError: lastError ?? "unknown send failure",
      nextAttemptAt:
        lastClassification === "transient"
          ? new Date(Date.now() + nextAttemptDelaySeconds(delivery.sendAttempts || 1, rng) * 1000)
          : null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(emailDeliveries.id, delivery.id),
        eq(emailDeliveries.status, "sending"),
        eq(emailDeliveries.providerAccepted, false),
      ),
    );

  // Auth bodies cannot be queued for a later retry, and public auth responses
  // intentionally hide whether an account exists. Surface exhausted transport
  // retries to operators without logging the recipient, OTP or provider body.
  if (lastClassification === "transient")
    safeLog(deps.logger, "error", "Email delivery inline retries exhausted", {
      deliveryId: delivery.id,
      category: input.category,
      classification: lastClassification,
      attempts: inlineAttempts,
    });

  emitEmailAudit(deps, {
    eventType: "email.delivery_failed",
    actorId: input.userId ?? null,
    payload: {
      deliveryId: delivery.id,
      category: input.category,
      classification: lastClassification,
      reason: lastError ?? "unknown send failure",
    },
  });

  return {
    ok: false,
    status: "failed",
    deliveryId: delivery.id,
    reason: lastError ?? "unknown send failure",
  };
}
