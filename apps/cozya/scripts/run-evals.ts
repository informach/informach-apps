/** Paid, opt-in regression evaluation. Missing fixtures/baselines and critical errors fail closed.
 * EVAL_SNAPSHOT=1 creates a baseline only after the COMPLETE dataset passes.
 * EVAL_PREFLIGHT=1 checks inputs without model calls. EVAL_FILTER narrows a comparison run.
 * EVAL_JUDGES=1 adds model judges; deterministic quantity/unit checks always run.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createOpenRouter } from "@informach/ai-core/providers";
import { generateText, Output } from "ai";
import { config as loadEnv } from "dotenv";
import { z } from "zod";
import { withModelFallbacks } from "../src/ai/fallbacks";
import { COZYA_MODELS } from "../src/ai/models";
import { criticalIssues } from "../src/ai/recipe-parser/evals/critical-checks";
import { DATASET, type DatasetEntry } from "../src/ai/recipe-parser/evals/dataset";
import { RECIPE_PARSER_INSTRUCTIONS } from "../src/ai/recipe-parser/instructions";
import { type RecipeParserOutput, recipeParserSchema } from "../src/ai/recipe-parser/schema";
import { ALL_SCORERS } from "../src/ai/recipe-parser/scorers";
import { RECIPE_REFINER_INSTRUCTIONS } from "../src/ai/recipe-refiner/instructions";
import { buildResearchPrompt } from "../src/features/ai/research-recipe-prompt";
import { providerCostMetadata } from "../src/features/ai/usage-metadata";

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EVALS_DIR = path.join(APP_DIR, "src/ai/recipe-parser/evals");
const BASELINE_PATH = path.join(EVALS_DIR, "__baseline__.json");
loadEnv({ path: path.join(APP_DIR, ".env.local") });
loadEnv({ path: path.resolve(APP_DIR, "../../.env") });
const snapshot = process.env.EVAL_SNAPSHOT === "1";
const observe = process.env.EVAL_OBSERVE === "1";
const filter = process.env.EVAL_FILTER;
const selected = DATASET.filter((entry) => !filter || entry.id.includes(filter));
const scorers = ALL_SCORERS.filter((scorer) => !scorer.usesLlm || process.env.EVAL_JUDGES === "1");
const checks = ["critical-fidelity", ...scorers.map((scorer) => scorer.name)];
const scoresSchema = z.record(z.number().min(0).max(1));
const bounded = { maxRetries: 0, maxOutputTokens: 3500, temperature: 0 } as const;

async function main() {
  if (!selected.length) throw new Error("No evaluation entries selected");
  if (new Set(DATASET.map((entry) => entry.id)).size !== DATASET.length)
    throw new Error("Duplicate evaluation IDs");
  if (snapshot && filter)
    throw new Error("A baseline requires the complete dataset; remove EVAL_FILTER");
  const fixtureHashes: Record<string, string> = {};
  for (const entry of selected) {
    if (entry.kind === "image") {
      const bytes = await readFile(path.join(EVALS_DIR, entry.input));
      if (bytes.length < 100) throw new Error(`Empty fixture: ${entry.id}`);
      fixtureHashes[entry.id] = createHash("sha256").update(bytes).digest("hex");
    }
    if (entry.expected.isValidRecipe === undefined)
      throw new Error(`Missing truth label: ${entry.id}`);
  }
  let baseline: Record<string, number> = {};
  if (!snapshot && !observe && process.env.EVAL_PREFLIGHT !== "1") {
    baseline = scoresSchema.parse(JSON.parse(await readFile(BASELINE_PATH, "utf8")));
    for (const entry of selected)
      for (const check of entry.kind === "prompt"
        ? [...checks, "retrieval-availability"]
        : checks) {
        if (baseline[`${entry.id}::${check}`] === undefined)
          throw new Error(`Incomplete baseline: ${entry.id}::${check}`);
      }
  }
  console.log(
    `[eval] preflight passed: ${selected.length} cases, ${Object.keys(fixtureHashes).length} image fixtures`,
  );
  if (process.env.EVAL_PREFLIGHT === "1") return;
  if (!process.env.OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY required");
  const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY });
  const textId = COZYA_MODELS["cozya.recipe.extract_from_text"];
  const textModel = openrouter(textId, withModelFallbacks(textId));
  const visionId = COZYA_MODELS["cozya.recipe.extract_from_photo"];
  const visionModel = openrouter(visionId, withModelFallbacks(visionId));
  if (snapshot && process.env.EVAL_RESEARCH_MODEL)
    throw new Error("Model experiments cannot replace the production baseline");
  const researchId =
    process.env.EVAL_RESEARCH_MODEL === "openai/gpt-4o"
      ? "openai/gpt-4o"
      : COZYA_MODELS["cozya.recipe.generate_from_prompt"];
  const researchModel = openrouter(researchId, {
    ...withModelFallbacks(researchId),
    extraBody: { ...withModelFallbacks(researchId).extraBody, max_tool_calls: 1 },
  });
  const costs: Record<string, unknown>[] = [];
  async function parse(entry: DatasetEntry): Promise<RecipeParserOutput> {
    let input = entry.input;
    let source: { url: string; title?: string } | undefined;
    if (entry.kind === "prompt") {
      const research = await generateText({
        ...bounded,
        maxOutputTokens: 2200,
        abortSignal: AbortSignal.timeout(90000),
        model: researchModel,
        tools: {
          web_search: openrouter.tools.webSearch({
            engine: "exa",
            maxResults: 5,
            searchPrompt: `Receita completa que corresponda exatamente a: ${entry.input}. Confira todos os ingredientes, cobertura e características pedidos antes de escolher a fonte.`,
          }),
        },
        prompt: buildResearchPrompt(input),
      });
      costs.push({
        id: entry.id,
        stage: "research",
        ...providerCostMetadata(research.providerMetadata),
      });
      const url = research.text.match(/^FONTE_URL:\s*(https?:\/\/\S+)/im)?.[1];
      const citation = research.sources.find(
        (item) => item.sourceType === "url" && item.url === url,
      );
      if (!citation || citation.sourceType !== "url")
        throw new Error("Research returned no matching citation");
      source = citation;
      input = JSON.stringify({ pedidoOriginal: entry.input, conteudoDaFonte: research.text });
    }
    const options = {
      ...bounded,
      abortSignal: AbortSignal.timeout(90000),
      output: Output.object({ schema: recipeParserSchema }),
      system: entry.kind === "refine" ? RECIPE_REFINER_INSTRUCTIONS : RECIPE_PARSER_INSTRUCTIONS,
    };
    const result =
      entry.kind === "image"
        ? await generateText({
            ...options,
            model: visionModel,
            messages: [
              {
                role: "user",
                content: [
                  { type: "text", text: "Extraia a receita desta imagem." },
                  {
                    type: "image",
                    image: await readFile(path.join(EVALS_DIR, entry.input)),
                    mediaType: path.extname(entry.input) === ".png" ? "image/png" : "image/jpeg",
                    providerOptions: { openai: { imageDetail: "high" } },
                  },
                ],
              },
            ],
          })
        : await generateText({
            ...options,
            model: textModel,
            prompt:
              entry.kind === "refine"
                ? JSON.stringify({ receita: entry.currentRecipe, pedido: input })
                : input,
          });
    costs.push({ id: entry.id, stage: "parse", ...providerCostMetadata(result.providerMetadata) });
    const output = recipeParserSchema.parse(result.output);
    return source ? { ...output, sourceUrl: source.url, sourceName: source.title ?? null } : output;
  }
  const results: {
    id: string;
    output?: RecipeParserOutput;
    issues: string[];
    scores: Record<string, number>;
    error?: string;
  }[] = [];
  // Sequential and without retries: bounded spend and clear per-case diagnostics.
  for (const entry of selected) {
    try {
      const output = await parse(entry);
      const issues = criticalIssues(output, entry.expected);
      const scores: Record<string, number> = { "critical-fidelity": issues.length ? 0 : 1 };
      if (entry.kind === "prompt") scores["retrieval-availability"] = output.isValidRecipe ? 1 : 0;
      for (const scorer of scorers) {
        const scored = await scorer.score(
          { id: entry.id, input: entry.input, output, expected: entry.expected },
          { judge: textModel },
        );
        scores[scorer.name] = scored.score;
        if (scored.score < 0.85) issues.push(`quality:${scorer.name}`);
      }
      results.push({ id: entry.id, output, issues, scores });
      if (entry.kind === "prompt" && !output.isValidRecipe)
        console.log(`[eval] SAFE REFUSAL ${entry.id}: no matching recipe delivered`);
      console.log(
        `[eval] ${issues.length ? "FAIL" : "PASS"} ${entry.id}${issues.length ? `: ${issues.join(", ")}` : ""}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 240) : "Unknown failure";
      results.push({ id: entry.id, issues: ["execution"], scores: {}, error: message });
      console.log(
        `[eval] ERROR ${entry.id}: ${error instanceof Error ? error.name : "UnknownError"}`,
      );
      // Provider/configuration failures affect the whole suite. Stop spending on the same fault.
      if (error instanceof Error && error.name === "AI_APICallError") break;
    }
  }
  const flat = Object.fromEntries(
    results.flatMap((result) =>
      Object.entries(result.scores).map(([name, score]) => [`${result.id}::${name}`, score]),
    ),
  );
  const report = {
    executedAt: new Date().toISOString(),
    models: { textId, visionId, researchId },
    webRetrieval: {
      requested: selected.filter((entry) => entry.kind === "prompt").length,
      delivered: results.filter((result) => result.scores["retrieval-availability"] === 1).length,
      safeRefusals: results.filter(
        (result) => result.scores["retrieval-availability"] === 0 && !result.issues.length,
      ).length,
    },
    judges: process.env.EVAL_JUDGES === "1",
    datasetSha256: createHash("sha256").update(JSON.stringify(DATASET)).digest("hex"),
    instructionsSha256: createHash("sha256")
      .update(RECIPE_PARSER_INSTRUCTIONS + RECIPE_REFINER_INSTRUCTIONS)
      .digest("hex"),
    fixtureHashes,
    costs,
    results,
  };
  await mkdir(path.join(APP_DIR, "tmp"), { recursive: true });
  await writeFile(path.join(APP_DIR, "tmp/evals-latest.json"), JSON.stringify(report, null, 2));
  if (results.some((result) => result.issues.length) || results.length !== selected.length)
    throw new Error(
      "Evaluation failed; inspect apps/cozya/tmp/evals-latest.json. Baseline was not changed.",
    );
  if (report.webRetrieval.requested && !report.webRetrieval.delivered && !observe)
    throw new Error("No web query delivered a matching recipe; cannot approve web availability");
  if (snapshot) {
    await writeFile(BASELINE_PATH, `${JSON.stringify(flat, null, 2)}\n`);
    await writeFile(
      path.join(EVALS_DIR, "__baseline-meta__.json"),
      `${JSON.stringify({ ...report, results: undefined, costs: undefined }, null, 2)}\n`,
    );
    console.log(`[eval] complete measured baseline written: ${results.length} cases`);
  } else if (observe) {
    console.log(
      `[eval] ${results.length} diagnostic cases passed; no historical comparison or baseline change`,
    );
  } else {
    for (const [key, score] of Object.entries(flat))
      if (score < (baseline[key] ?? 1) - 0.1) throw new Error(`Regression: ${key}`);
    console.log(`[eval] ${results.length} cases passed against baseline`);
  }
}
main().catch((error: unknown) => {
  console.error(`[eval] ${error instanceof Error ? error.message : "Failed"}`);
  process.exitCode = 1;
});
