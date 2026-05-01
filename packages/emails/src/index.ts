import type { Database } from "@informach/db";
import sgMail from "@sendgrid/mail";
import {
  type DispatchInput,
  type DispatchMode,
  type DispatchResult,
  dispatchEmail,
  type EmailAddress,
  type EmailCategory,
  type MemoryOutbox,
  type MemoryOutboxEntry,
  type SendFn,
} from "./dispatch";
import type { Logger } from "./logger";
import { type RenderTemplate, renderTemplate as renderTemplateImpl } from "./templates";

export type {
  DispatchInput,
  DispatchMode,
  DispatchResult,
  EmailAddress,
  EmailCategory,
  MemoryOutbox,
  MemoryOutboxEntry,
  SendFn,
  SendgridMessage,
} from "./dispatch";

export type { Logger } from "./logger";
export { dispatchEmail } from "./dispatch";
export {
  buildUnsubscribeToken,
  verifyUnsubscribeToken,
} from "./list-unsubscribe";
export {
  DEFAULT_LOCALE,
  type Locale,
  type RenderTemplate,
  type RenderTemplatePropsByCategory,
  type RenderTemplateResult,
  renderTemplate,
  SUPPORTED_LOCALES,
} from "./templates";
export { EMAIL_CATEGORIES, EmailCategorySchema, SendEmailInputSchema } from "./schemas";

export class EmailDeliveryError extends Error {
  readonly statusCode?: number;
  readonly body?: unknown;

  constructor(message: string, options?: { statusCode?: number; body?: unknown; cause?: unknown }) {
    super(message, options?.cause ? { cause: options.cause } : undefined);
    this.name = "EmailDeliveryError";
    this.statusCode = options?.statusCode;
    this.body = options?.body;
  }
}

export type SendEmailInput = {
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

export type SendEmail = (input: SendEmailInput) => Promise<DispatchResult>;

/**
 * Build a `SendFn` ready to inject in `retryFailedDeliveries`/`createEmailService`
 * without exposing `@sendgrid/mail` to consumer apps. Sets the API key at first
 * call and re-uses the singleton `sgMail`.
 */
export function createSendGridSend(apiKey: string): SendFn {
  if (!apiKey) {
    throw new Error("createSendGridSend: apiKey is required");
  }
  sgMail.setApiKey(apiKey);
  return async (msg) => {
    const result = await sgMail.send(msg as Parameters<typeof sgMail.send>[0]);
    const response = Array.isArray(result) ? result[0] : result;
    const headers = (response?.headers ?? {}) as Record<string, string | undefined>;
    return { messageId: headers["x-message-id"] };
  };
}

export type EmailServiceConfig = {
  apiKey: string;
  defaultFrom: EmailAddress;
  db: Database;
  mode?: DispatchMode;
  sandboxDir?: string;
  logger?: Logger;
};

export type EmailService = {
  sendEmail: SendEmail;
  renderTemplate: RenderTemplate;
  /** Available only when `mode === "memory"`. Returns an immutable view of accumulated outbox entries. */
  getOutbox: () => readonly MemoryOutboxEntry[];
  /** Available only when `mode === "memory"`. Clears the in-memory outbox. */
  clearOutbox: () => void;
};

function createMemoryOutbox(): MemoryOutbox {
  const entries: MemoryOutboxEntry[] = [];
  return {
    push: (entry) => {
      entries.push(entry);
    },
    list: () => entries,
    clear: () => {
      entries.length = 0;
    },
  };
}

export function createEmailService(config: EmailServiceConfig): EmailService {
  if (!config.apiKey && config.mode === "live") {
    throw new Error("createEmailService: apiKey is required when mode is 'live'");
  }
  if (!config.defaultFrom) {
    throw new Error("createEmailService: defaultFrom is required");
  }
  if (!config.db) {
    throw new Error("createEmailService: db is required");
  }

  const mode: DispatchMode = config.mode ?? "live";
  const sandboxDir = config.sandboxDir ?? "./tmp/integration_emails";

  if (mode === "live") {
    sgMail.setApiKey(config.apiKey);
  }

  const send: SendFn = async (msg) => {
    const result = await sgMail.send(msg as Parameters<typeof sgMail.send>[0]);
    const response = Array.isArray(result) ? result[0] : result;
    const headers = (response?.headers ?? {}) as Record<string, string | undefined>;
    const messageId = headers["x-message-id"];
    return { messageId };
  };

  const outbox = mode === "memory" ? createMemoryOutbox() : undefined;

  const deps = {
    db: config.db,
    defaultFrom: config.defaultFrom,
    mode,
    sandboxDir,
    send,
    outbox,
    logger: config.logger,
  } as const;

  const sendEmail: SendEmail = (input: DispatchInput) => dispatchEmail(deps, input);

  return {
    sendEmail,
    renderTemplate: renderTemplateImpl,
    getOutbox: () => outbox?.list() ?? [],
    clearOutbox: () => outbox?.clear(),
  };
}
