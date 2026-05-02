import { z } from "zod";

export const EMAIL_CATEGORIES = [
  "auth.verify-email",
  "auth.password-reset",
  "auth.magic-link",
  "auth.invitation",
  "auth.account-deletion",
  "billing.payment-success",
  "billing.payment-failed",
  "billing.subscription-renewed",
  "billing.subscription-canceled",
  "billing.credits-purchased",
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
