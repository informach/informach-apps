import type { LanguageModel } from "ai";
import type { RecipeParserOutput } from "../schema";

/**
 * Resultado bruto de um scorer aplicado a uma entrada do golden dataset. Score
 * é normalizado em [0, 1] — onde 1 = "passou totalmente" e 0 = "falhou
 * totalmente". Scorers binários usam 0/1; scorers contínuos podem usar
 * intermediários (ex.: 0.7 = "essencialmente bom mas com ressalvas").
 */
export type ScoreResult = {
  score: number;
  reason: string;
  /** Sub-scores opcionais para diagnóstico (ex.: rubric LLM-as-judge). */
  details?: Record<string, unknown>;
};

/**
 * Contexto fornecido pelo runner. `judge` é o model usado pelos scorers
 * LLM-as-judge — recebido por injeção para que os scorers fiquem puros (não
 * importam `@/lib/openrouter`, que é server-only e quebraria o eval em Node).
 */
export type ScorerContext = {
  judge: LanguageModel;
};

/**
 * Input genérico que um scorer recebe. `input` é o conteúdo bruto entregue ao
 * agent (texto, prompt, image data URL, transcript). `output` é o objeto
 * estruturado retornado pelo agent. `expected` vem do dataset e descreve o
 * que se espera observar — cada scorer interpreta livremente.
 */
export type ScoreInput<TInput = unknown, TExpected = unknown> = {
  id: string;
  input: TInput;
  output: RecipeParserOutput;
  expected?: TExpected;
};

export type Scorer = {
  name: string;
  /**
   * Marca scorers que disparam chamadas LLM (custo). O runner pode pular esses
   * em modos `--no-llm` para validar só plumbing/schema.
   */
  usesLlm: boolean;
  score: (input: ScoreInput, ctx: ScorerContext) => Promise<ScoreResult>;
};
