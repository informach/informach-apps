/**
 * Eval runner para o `recipeParser` (cozya).
 *
 * Roda o golden dataset (`src/ai/recipe-parser/evals/dataset.ts`) contra os
 * 3 scorers (`src/ai/recipe-parser/scorers/`) e, opcionalmente, gera/diff
 * baseline (`src/ai/recipe-parser/evals/__baseline__.json`). Detecta
 * regressão > REGRESSION_THRESHOLD e devolve exit non-zero.
 *
 * **Custo**: cada run dispara chamadas reais ao OpenRouter. Estimativa para
 * o dataset cheio (15 entradas × 3 scorers, 2 deles LLM-as-judge):
 *   - ~3 chamadas por entrada não-prompt = 45 calls × ~R$ 0,02 ≈ R$ 0,90
 *   - prompts adicionam web_search (1 call extra cada) = +R$ 0,04
 * Custo total típico: **~R$ 1,00 por run**. Não rodar em CI por default.
 *
 * Uso:
 *   pnpm --filter @informach/cozya eval                      # diff vs baseline
 *   EVAL_SNAPSHOT=1 pnpm --filter @informach/cozya eval      # grava baseline
 *   EVAL_FILTER=text- pnpm --filter @informach/cozya eval    # só ids contendo "text-"
 *   EVAL_CONCURRENCY=5 pnpm --filter @informach/cozya eval   # paralelismo (default 3)
 *   EVAL_NO_LLM=1 pnpm --filter @informach/cozya eval        # pula scorers LLM-as-judge
 *
 * Imagens (kind: "image") só rodam quando o arquivo existe em
 * `src/ai/recipe-parser/evals/fixtures/<filename>`. Caso contrário, a entrada
 * é marcada como "skipped" e não conta no baseline (evita regressão falsa).
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { withRetry } from "@informach/ai-core";
import { createOpenRouter } from "@informach/ai-core/providers";
import { generateText, Output } from "ai";
import { config as loadEnv } from "dotenv";

import { withModelFallbacks } from "../src/ai/fallbacks";
import { COZYA_MODELS } from "../src/ai/models";
import { DATASET, type DatasetEntry } from "../src/ai/recipe-parser/evals/dataset";
import { RECIPE_PARSER_INSTRUCTIONS } from "../src/ai/recipe-parser/instructions";
import { type RecipeParserOutput, recipeParserSchema } from "../src/ai/recipe-parser/schema";
import { ALL_SCORERS, type Scorer, type ScorerContext } from "../src/ai/recipe-parser/scorers";
import { buildResearchPrompt } from "../src/features/ai/research-recipe-prompt";

const REGRESSION_THRESHOLD = 0.1; // queda > 10 pontos percentuais alerta

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../../..");
const EVALS_DIR = path.resolve(__dirname, "../src/ai/recipe-parser/evals");
const FIXTURES_DIR = path.resolve(EVALS_DIR, "fixtures");
const BASELINE_PATH = path.resolve(EVALS_DIR, "__baseline__.json");

loadEnv({ path: path.resolve(REPO_ROOT, ".env") });

const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) {
  console.error("[eval] OPENROUTER_API_KEY required (set in .env at repo root)");
  process.exit(1);
}

const openrouter = createOpenRouter({
  apiKey,
  headers: {
    ...(process.env.OPENROUTER_HTTP_REFERER
      ? { "HTTP-Referer": process.env.OPENROUTER_HTTP_REFERER }
      : {}),
    ...(process.env.OPENROUTER_X_TITLE
      ? { "X-OpenRouter-Title": process.env.OPENROUTER_X_TITLE }
      : {}),
  },
});

const textModelId = COZYA_MODELS["cozya.recipe.extract_from_text"];
const visionModelId = COZYA_MODELS["cozya.recipe.extract_from_photo"];
const researchModelId = COZYA_MODELS["cozya.recipe.generate_from_prompt"];

const textModel = openrouter(textModelId, withModelFallbacks(textModelId));
const visionModel = openrouter(visionModelId, withModelFallbacks(visionModelId));
const researchModel = openrouter(researchModelId, withModelFallbacks(researchModelId));

// Juiz para os scorers LLM-as-judge (mesmo modelo barato que o parser
// principal — o que importa é consistência ao longo de runs, não capacidade).
const judgeModel = openrouter(textModelId, withModelFallbacks(textModelId));

const filterPattern = process.env.EVAL_FILTER ?? null;
const concurrency = Math.max(1, Number(process.env.EVAL_CONCURRENCY ?? "3"));
const snapshotMode = process.env.EVAL_SNAPSHOT === "1";
const skipLlmScorers = process.env.EVAL_NO_LLM === "1";

const scorers: readonly Scorer[] = skipLlmScorers
  ? ALL_SCORERS.filter((s) => !s.usesLlm)
  : ALL_SCORERS;
const scorerCtx: ScorerContext = { judge: judgeModel };

type EntryResult =
  | { entry: DatasetEntry; status: "ok"; output: RecipeParserOutput; scores: ScoredResult[] }
  | { entry: DatasetEntry; status: "skipped"; reason: string }
  | { entry: DatasetEntry; status: "error"; error: string };

type ScoredResult = {
  scorer: string;
  score: number;
  reason: string;
};

async function runEntry(entry: DatasetEntry): Promise<RecipeParserOutput> {
  switch (entry.kind) {
    case "text":
    case "voice": {
      const out = await withRetry(() =>
        generateText({
          model: textModel,
          output: Output.object({ schema: recipeParserSchema }),
          system: RECIPE_PARSER_INSTRUCTIONS,
          prompt: entry.input,
        }),
      );
      return out.output as RecipeParserOutput;
    }
    case "image": {
      const filePath = path.resolve(EVALS_DIR, entry.input);
      const buf = await readFile(filePath);
      const ext = path.extname(filePath).slice(1).toLowerCase();
      const mime = ext === "png" ? "image/png" : "image/jpeg";
      const dataUrl = `data:${mime};base64,${buf.toString("base64")}`;
      const out = await withRetry(() =>
        generateText({
          model: visionModel,
          output: Output.object({ schema: recipeParserSchema }),
          system: RECIPE_PARSER_INSTRUCTIONS,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: "Extraia a receita desta imagem." },
                {
                  type: "image",
                  image: dataUrl,
                  providerOptions: { openai: { imageDetail: "low" } },
                },
              ],
            },
          ],
        }),
      );
      return out.output as RecipeParserOutput;
    }
    case "prompt": {
      const research = await withRetry(() =>
        generateText({
          model: researchModel,
          tools: {
            web_search: openrouter.tools.webSearch({ engine: "auto", maxResults: 5 }),
          },
          toolChoice: "auto",
          prompt: buildResearchPrompt(entry.input),
        }),
      );
      const text = research.text.trim();
      if (text.startsWith("NAO_ENCONTRADA") || text.length < 30) {
        return {
          isValidRecipe: false,
          reason: "Research miss",
          name: null,
          ingredients: null,
          preparation: null,
          finishing: null,
        };
      }
      const parsed = await withRetry(() =>
        generateText({
          model: textModel,
          output: Output.object({ schema: recipeParserSchema }),
          system: RECIPE_PARSER_INSTRUCTIONS,
          prompt: text,
        }),
      );
      return parsed.output as RecipeParserOutput;
    }
  }
}

async function ensureFixtureExists(entry: DatasetEntry): Promise<string | null> {
  if (entry.kind !== "image") return null;
  const filePath = path.resolve(EVALS_DIR, entry.input);
  try {
    await readFile(filePath);
    return null;
  } catch {
    return `fixture missing: ${path.relative(FIXTURES_DIR, filePath)}`;
  }
}

async function processEntry(entry: DatasetEntry): Promise<EntryResult> {
  const skipReason = await ensureFixtureExists(entry);
  if (skipReason) return { entry, status: "skipped", reason: skipReason };
  try {
    const output = await runEntry(entry);
    const scores = await Promise.all(
      scorers.map(async (s) => {
        const r = await s.score(
          { id: entry.id, input: entry.input, output, expected: entry.expected },
          scorerCtx,
        );
        return { scorer: s.name, score: r.score, reason: r.reason };
      }),
    );
    return { entry, status: "ok", output, scores };
  } catch (err) {
    return { entry, status: "error", error: err instanceof Error ? err.message : String(err) };
  }
}

async function runWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) break;
      const item = items[i];
      if (!item) break;
      results[i] = await fn(item);
    }
  });
  await Promise.all(workers);
  return results;
}

function buildFlatScoreMap(results: readonly EntryResult[]): Record<string, number> {
  const flat: Record<string, number> = {};
  for (const r of results) {
    if (r.status !== "ok") continue;
    for (const s of r.scores) {
      flat[`${r.entry.id}::${s.scorer}`] = s.score;
    }
  }
  return flat;
}

async function main(): Promise<void> {
  const entries = filterPattern ? DATASET.filter((e) => e.id.includes(filterPattern)) : DATASET;

  console.log(
    `[eval] running ${entries.length}/${DATASET.length} entries · concurrency=${concurrency} · scorers=${scorers.map((s) => s.name).join(",")}`,
  );
  if (snapshotMode) console.log("[eval] mode: SNAPSHOT (writes baseline, no diff)");

  const startedAt = Date.now();
  const results = await runWithConcurrency(entries, concurrency, processEntry);
  const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);

  // Tabela achatada
  const tableRows = results.flatMap((r) => {
    if (r.status === "skipped") {
      return [
        { id: r.entry.id, kind: r.entry.kind, scorer: "(skipped)", score: "-", note: r.reason },
      ];
    }
    if (r.status === "error") {
      return [
        {
          id: r.entry.id,
          kind: r.entry.kind,
          scorer: "(error)",
          score: "-",
          note: r.error.slice(0, 80),
        },
      ];
    }
    return r.scores.map((s) => ({
      id: r.entry.id,
      kind: r.entry.kind,
      scorer: s.scorer,
      score: s.score.toFixed(2),
      note: s.reason.slice(0, 60),
    }));
  });
  console.table(tableRows);

  const flat = buildFlatScoreMap(results);
  const okCount = results.filter((r) => r.status === "ok").length;
  const skippedCount = results.filter((r) => r.status === "skipped").length;
  const errorCount = results.filter((r) => r.status === "error").length;
  const aggregate =
    Object.values(flat).length === 0
      ? 0
      : Object.values(flat).reduce((a, b) => a + b, 0) / Object.values(flat).length;

  console.log(
    `[eval] done in ${elapsedSeconds}s · ok=${okCount} skipped=${skippedCount} error=${errorCount} · aggregate=${aggregate.toFixed(3)}`,
  );

  if (snapshotMode) {
    await writeFile(BASELINE_PATH, `${JSON.stringify(flat, null, 2)}\n`, "utf8");
    console.log(`[eval] baseline written: ${path.relative(REPO_ROOT, BASELINE_PATH)}`);
    return;
  }

  let baseline: Record<string, number> = {};
  try {
    baseline = JSON.parse(await readFile(BASELINE_PATH, "utf8"));
  } catch {
    console.warn(
      `[eval] baseline missing — run \`EVAL_SNAPSHOT=1 pnpm --filter @informach/cozya eval\` once to seed`,
    );
    if (errorCount > 0) process.exit(1);
    return;
  }

  const regressions: { key: string; from: number; to: number }[] = [];
  for (const [key, current] of Object.entries(flat)) {
    const prev = baseline[key];
    if (prev !== undefined && current < prev - REGRESSION_THRESHOLD) {
      regressions.push({ key, from: prev, to: current });
    }
  }

  if (regressions.length > 0) {
    console.error(`[eval] ${regressions.length} regression(s) > ${REGRESSION_THRESHOLD}:`);
    for (const r of regressions) {
      console.error(`  - ${r.key}: ${r.from.toFixed(2)} → ${r.to.toFixed(2)}`);
    }
    process.exit(1);
  }
  if (errorCount > 0) {
    console.error(`[eval] ${errorCount} entries errored — exit non-zero`);
    process.exit(1);
  }
  console.log("[eval] no regressions vs baseline");
}

main().catch((err) => {
  console.error("[eval] fatal:", err);
  process.exit(1);
});
