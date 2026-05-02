import { z } from "zod";

export const subjectRefSchema = z.object({
  type: z.enum(["user", "organization"]),
  id: z.string().min(1),
});

export const subscriptionCheckoutInputSchema = z.object({
  subject: subjectRefSchema,
  productId: z.string().min(1),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
  trialDays: z.number().int().positive().optional(),
});

export const creditPackCheckoutInputSchema = z.object({
  subject: subjectRefSchema,
  productId: z.string().min(1),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
});

export const portalSessionInputSchema = z.object({
  subject: subjectRefSchema,
  returnUrl: z.string().url(),
});

export const reserveCreditsInputSchema = z.object({
  owner: subjectRefSchema,
  estimatedAmount: z.number().int().positive(),
  app: z.string().min(1),
  feature: z.string().min(1),
  model: z.string().min(1).optional(),
  runId: z.string().min(1).optional(),
  requestId: z.string().min(1).optional(),
  ttlSeconds: z.number().int().positive().max(3600).optional(),
});

export const commitReservationInputSchema = z.object({
  reservationId: z.string().uuid(),
  actualAmount: z.number().int().positive(),
  metadata: z.record(z.unknown()).optional(),
});

export const releaseReservationInputSchema = z.object({
  reservationId: z.string().uuid(),
  reason: z.enum(["user_cancel", "llm_error", "timeout", "validation_failed"]),
});

export const consumeCreditsInputSchema = z.object({
  owner: subjectRefSchema,
  amount: z.number().int().positive(),
  reason: z.string().min(1),
  runId: z.string().min(1).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const grantBonusCreditsInputSchema = z.object({
  owner: subjectRefSchema,
  amount: z.number().int().positive(),
  reason: z.enum(["subscription_monthly", "promo", "compensation"]),
  expiresAt: z.date().nullable().optional(),
  stripeEventId: z.string().min(1).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const refundCreditsInputSchema = z.object({
  owner: subjectRefSchema,
  originalLedgerEntryId: z.string().uuid(),
  amount: z.number().int().positive(),
  stripeEventId: z.string().min(1),
  reason: z.string().min(1),
});

export const getOrCreateCustomerInputSchema = z.object({
  subject: subjectRefSchema,
  email: z.string().email(),
  metadata: z.record(z.unknown()).optional(),
});
