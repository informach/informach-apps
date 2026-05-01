import type { Database } from "@informach/db";
import sgMail from "@sendgrid/mail";
import {
  type DispatchInput,
  type DispatchResult,
  dispatchEmail,
  type EmailAddress,
  type EmailCategory,
  type SendFn,
} from "./dispatch";

export type {
  DispatchInput,
  DispatchResult,
  EmailAddress,
  EmailCategory,
  SendFn,
  SendgridMessage,
} from "./dispatch";

export { dispatchEmail } from "./dispatch";
export {
  buildUnsubscribeToken,
  verifyUnsubscribeToken,
} from "./list-unsubscribe";

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

export type EmailServiceConfig = {
  apiKey: string;
  defaultFrom: EmailAddress;
  db: Database;
  mode?: "live" | "sandbox";
  sandboxDir?: string;
  logger?: { error: (msg: string, ctx?: object) => void };
};

export type EmailService = {
  sendEmail: SendEmail;
};

export function createEmailService(config: EmailServiceConfig): EmailService {
  if (!config.apiKey) {
    throw new Error("createEmailService: apiKey is required");
  }
  if (!config.defaultFrom) {
    throw new Error("createEmailService: defaultFrom is required");
  }
  if (!config.db) {
    throw new Error("createEmailService: db is required");
  }

  const mode: "live" | "sandbox" = config.mode ?? "live";
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

  const deps = {
    db: config.db,
    defaultFrom: config.defaultFrom,
    mode,
    sandboxDir,
    send,
    logger: config.logger,
  } as const;

  const sendEmail: SendEmail = (input: DispatchInput) => dispatchEmail(deps, input);

  return { sendEmail };
}
