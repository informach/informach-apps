import { APPS, type AppMetadata, type CollectionId, findApp } from "./apps";

/** App membership belongs to APPS; collections do not maintain a second app list. */
export const COMMERCE_COLLECTIONS = {
  compasso: { id: "compasso", name: "Compasso", kind: "web" },
  edi: { id: "edi", name: "Suíte Edi", kind: "desktop" },
  recreio: { id: "recreio", name: "Recreio", kind: "games" },
} as const satisfies Record<CollectionId, { id: CollectionId; name: string; kind: string }>;

/** Subscription and AI policy explicitly approved by the product owner on 2026-11-09. */
export const COMPASSO_POLICY = {
  currency: "BRL",
  monthlyAmountCents: 4990,
  annualAmountCents: 49900,
  capacity: { adults: 2, dependents: 4 },
  trialDays: 14,
  ai: {
    monthlyCredits: 200,
    trialCredits: 20,
    monthlyRollover: false,
    purchasedCreditsExpire: false,
    packs: [
      { id: "compasso_credits_100", credits: 100, amountCents: 1490 },
      { id: "compasso_credits_300", credits: 300, amountCents: 3990 },
      { id: "compasso_credits_1000", credits: 1000, amountCents: 9990 },
    ],
  },
} as const;

/** Preserve every legacy one-credit operation at the reviewed maximum accepted tariff.
 * These are migration ratios, not prices for future purchases. Keep old policies immutable.
 */
export const COMPASSO_LEGACY_CREDIT_POLICIES = {
  cozya: {
    policyId: "cozya-2026-11-10-v1",
    tariffVersion: "2026-11-10-v1",
    multiplier: 15,
    webhookScope: "Cozya",
  },
  "agenda-da-turma": {
    policyId: "agenda-2026-11-10-v1",
    tariffVersion: "2026-11-10-v1",
    multiplier: 57,
    webhookScope: "Agenda da Turma",
  },
} as const;

export function getAppCollection(app: string): CollectionId | null {
  return findApp(app)?.collection ?? null;
}

export function getCollectionApps(
  collection: CollectionId,
  options: { publishedOnly?: boolean } = {},
): readonly AppMetadata[] {
  return Object.values(APPS).filter(
    (app) => app.collection === collection && (!options.publishedOnly || app.published),
  );
}
