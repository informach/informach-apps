import { db } from "@informach/db";
import { createEmailService } from "@informach/emails";
import { env } from "./env";
import { packageLogger } from "./observability";

export const emails = createEmailService({
  apiKey: env.SENDGRID_API_KEY,
  defaultFrom: env.SENDGRID_FROM,
  db,
  mode: env.EMAIL_SANDBOX_MODE,
  sandboxDir: env.EMAIL_SANDBOX_DIR,
  logger: packageLogger,
});
