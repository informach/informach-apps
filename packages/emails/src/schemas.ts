import { z } from "zod";

export const EMAIL_CATEGORIES = [
  "admin.alert",
  "admin.weekly-summary",
  "agenda.routine",
  "auth.verify-email",
  "auth.verify-email-otp",
  "auth.sign-in-otp",
  "auth.forget-password-otp",
  "auth.password-reset",
  "auth.magic-link",
  "auth.invitation",
  "auth.account-deletion",
  "auth.signup-attempt-on-existing",
  "auth.two-factor-setup-otp",
  "billing.payment-success",
  "billing.payment-failed",
  "billing.subscription-renewed",
  "billing.subscription-canceled",
  "billing.credits-purchased",
  "billing.credits-warning",
  "missao.weekly-report",
] as const;

export const EmailCategorySchema = z.enum(EMAIL_CATEGORIES);

export const SendEmailInputSchema = z
  .object({
    to: z.string().email(),
    subject: z.string().min(1, "subject must not be empty"),
    html: z.string().min(1).optional(),
    text: z.string().min(1).optional(),
    from: z.string().email().optional(),
    category: EmailCategorySchema,
    messageKey: z.string().min(1, "messageKey is required"),
    unsubscribeUrl: z.string().url(),
    unsubscribeMailto: z.string().email().optional(),
    userId: z.string().min(1).optional(),
  })
  .refine((value) => Boolean(value.html ?? value.text), {
    message: "at least one of `html` or `text` must be provided",
    path: ["html"],
  });

export type SendEmailInputParsed = z.infer<typeof SendEmailInputSchema>;
