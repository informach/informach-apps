import type { Database } from "@informach/db";
import { schema } from "@informach/db";
import { sql } from "drizzle-orm";

const { creditPricing } = schema;

export type CreditPricingSeedRow = {
  feature: string;
  model: string;
  promptCostPer1k?: number;
  completionCostPer1k?: number;
  flatCost?: number;
  defaultEstimateCredits: number;
  metadata?: Record<string, unknown>;
};

// Cozya pricing — 1 chamada à API = 1 crédito (flatCost), independente do
// volume real de tokens. Tokens reais ficam em ai.usage_logs (linkados via
// runId) para auditoria/ajuste futuro de markup, mas não afetam o débito.
//
// Modelo default por feature — escolha justifica preço/qualidade:
// - Foto: openai/gpt-4o (vision superior em foto de receita escrita à mão/impressa).
//   Custo é mitigado via providerOptions.openai.imageDetail = 'low' no caller.
// - Texto/URL/geração/refino/parse_voice: openai/gpt-4o-mini (5x mais barato
//   que gpt-4o, suficiente para extração estruturada com schema Zod).
// - Transcrição de áudio: openai/whisper-1 via OpenRouter
//   (`/audio/transcriptions` OpenAI-compatible).
//
// IDs prefixados com `openai/` são convenção do OpenRouter (gateway único do
// projeto). Cozya migrou de OpenAI direto → OpenRouter; rows antigas com IDs
// não-prefixados ficam históricas (effective_to setado por
// expireLegacyCozyaPricing antes deste seed rodar).
//
// Para trocar de modelo no futuro: NÃO mutar a row existente — inserir nova
// com effective_to setado na anterior. Use a mesma estratégia (helper
// dedicado de expire) em janelas de upgrade.
export const COZYA_PRICING_SEED: readonly CreditPricingSeedRow[] = [
  {
    feature: "cozya.recipe.extract_from_photo",
    model: "openai/gpt-4o",
    flatCost: 1,
    defaultEstimateCredits: 1,
    metadata: { providerOptions: { openai: { imageDetail: "low" } } },
  },
  {
    feature: "cozya.recipe.extract_from_url",
    model: "openai/gpt-4o-mini",
    flatCost: 1,
    defaultEstimateCredits: 1,
  },
  {
    feature: "cozya.recipe.extract_from_text",
    model: "openai/gpt-4o-mini",
    flatCost: 1,
    defaultEstimateCredits: 1,
  },
  {
    feature: "cozya.recipe.generate_from_prompt",
    model: "openai/gpt-4o-mini",
    flatCost: 1,
    defaultEstimateCredits: 1,
  },
  {
    feature: "cozya.recipe.refine_conversational",
    model: "openai/gpt-4o-mini",
    flatCost: 1,
    defaultEstimateCredits: 1,
  },
  {
    feature: "cozya.recipe.transcribe_audio",
    model: "openai/whisper-1",
    flatCost: 1,
    defaultEstimateCredits: 1,
  },
  {
    feature: "cozya.recipe.parse_voice",
    model: "openai/gpt-4o-mini",
    flatCost: 1,
    defaultEstimateCredits: 1,
  },
] as const;

/**
 * IDs de modelo usados antes da migração para OpenRouter. Mantidos aqui só
 * para o helper de expire — o seed ativo usa exclusivamente IDs prefixados.
 */
const COZYA_LEGACY_MODELS = ["gpt-4o", "gpt-4o-mini", "whisper-1"] as const;

export type ExpireLegacyCozyaPricingResult = {
  closed: number;
};

/**
 * Fecha rows ativas de `billing.credit_pricing` que ainda referenciam IDs de
 * modelo antigos (não-prefixados pelo provider). Idempotente — re-executar é
 * no-op porque rows já fechadas têm `effective_to NOT NULL`.
 *
 * Deve rodar ANTES de `seedCozyaCreditPricing` quando há migração de model
 * (`pnpm db:seed` faz isso na ordem correta). A regra "pricing é versionada
 * por (feature, model) e nunca mutada" exige fechar a antiga antes de inserir
 * a nova — o helper sozinho garante isso sem precisar de SQL ad-hoc no deploy.
 */
export async function expireLegacyCozyaPricing(
  db: Database,
): Promise<ExpireLegacyCozyaPricingResult> {
  const result = await db
    .update(creditPricing)
    .set({ effectiveTo: sql`now()` })
    .where(
      sql`${creditPricing.feature} LIKE 'cozya.%'
          AND ${creditPricing.model} = ANY(${COZYA_LEGACY_MODELS as readonly string[]})
          AND ${creditPricing.effectiveTo} IS NULL`,
    )
    .returning({ id: creditPricing.id });
  return { closed: result.length };
}

export type SeedCreditPricingResult = {
  inserted: number;
  skipped: number;
};

/**
 * Idempotently seeds `billing.credit_pricing` rows. For each (feature, model)
 * pair, inserts only when there's no active row (effective_to IS NULL).
 *
 * Safe to re-run on every deploy. To bump the price/model of an existing
 * feature, set `effective_to = now()` on the active row in a prior step, then
 * re-run this seed — the new row becomes the active one for that pair.
 */
export async function seedCozyaCreditPricing(
  db: Database,
  rows: readonly CreditPricingSeedRow[] = COZYA_PRICING_SEED,
): Promise<SeedCreditPricingResult> {
  let inserted = 0;
  let skipped = 0;
  for (const row of rows) {
    const existing = await db
      .select({ id: creditPricing.id })
      .from(creditPricing)
      .where(
        sql`${creditPricing.feature} = ${row.feature}
            AND ${creditPricing.model} = ${row.model}
            AND ${creditPricing.effectiveTo} IS NULL`,
      )
      .limit(1);
    if (existing.length > 0) {
      skipped++;
      continue;
    }
    await db.insert(creditPricing).values({
      feature: row.feature,
      model: row.model,
      promptCostPer1k: row.promptCostPer1k ?? 0,
      completionCostPer1k: row.completionCostPer1k ?? 0,
      flatCost: row.flatCost ?? 0,
      defaultEstimateCredits: row.defaultEstimateCredits,
      metadata: row.metadata ?? {},
    });
    inserted++;
  }
  return { inserted, skipped };
}
