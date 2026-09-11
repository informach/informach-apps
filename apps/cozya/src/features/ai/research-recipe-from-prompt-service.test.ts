import { beforeEach, describe, expect, it, vi } from "vitest";

const generateText = vi.hoisted(() => vi.fn());
const generate = vi.hoisted(() => vi.fn());
const billing = vi.hoisted(() => ({
  reserveCredits: vi.fn(),
  commitReservation: vi.fn(),
  releaseReservation: vi.fn(),
}));
const recorder = vi.hoisted(() => ({ start: vi.fn(), finish: vi.fn() }));
const model = vi.hoisted(() => vi.fn(() => ({})));
vi.mock("server-only", () => ({}));
vi.mock("ai", () => ({ generateText }));
vi.mock("@/ai", () => ({ getMastra: () => ({ getAgent: () => ({ generate }) }) }));
vi.mock("@/ai/agent-run-recorder", () => ({ agentRunRecorder: recorder }));
vi.mock("@/features/billing/service", () => ({ billing }));
vi.mock("@/lib/openrouter", () => ({
  getOpenRouter: () => Object.assign(model, { tools: { webSearch: () => ({ type: "provider" }) } }),
}));

import { researchRecipeFromPrompt } from "./research-recipe-from-prompt-service";

const recipe = {
  servings: null,
  totalMinutes: null,
  sourceUrl: null,
  sourceName: null,
  isValidRecipe: true,
  reason: null,
  name: "Arroz",
  ingredients: "1 xícara de arroz",
  preparation: "Cozinhe o arroz.",
  finishing: null,
};
const url = "https://example.com/arroz";
function foundResearch() {
  return {
    text: `FONTE_URL: ${url}\nNOME: Arroz\nINGREDIENTES: 1 xícara de arroz\nMODO DE PREPARO: Cozinhe o arroz.`,
    sources: [{ sourceType: "url", id: url, url, title: "Caderno de receitas" }],
    usage: { inputTokens: 20, outputTokens: 30, totalTokens: 50 },
    providerMetadata: { openrouter: { usage: { cost: 0.008 } } },
  };
}

describe("pesquisa com reserva real e fontes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    billing.reserveCredits.mockImplementation(async (input) => ({ id: input.reservationId }));
    billing.commitReservation.mockResolvedValue({ ledgerEntryId: "ledger", balanceAfter: 2 });
    billing.releaseReservation.mockResolvedValue(undefined);
    generateText.mockResolvedValue(foundResearch());
    generate.mockResolvedValue({
      object: recipe,
      usage: { inputTokens: 40, outputTokens: 60, totalTokens: 100 },
    });
  });
  it("libera a reserva sem cobrar quando a pesquisa não encontra receita", async () => {
    generateText.mockResolvedValue({ ...foundResearch(), text: "NAO_ENCONTRADA", sources: [] });
    await expect(
      researchRecipeFromPrompt({ userId: "user-1", prompt: "receita ausente" }),
    ).rejects.toThrow("Nenhum crédito");
    expect(billing.releaseReservation).toHaveBeenCalledOnce();
    expect(billing.commitReservation).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });
  it("recusa URL que o modelo escreveu sem uma citação correspondente", async () => {
    generateText.mockResolvedValue({
      ...foundResearch(),
      text: "FONTE_URL: https://inexistente.example/arroz\nReceita imaginada",
    });
    await expect(researchRecipeFromPrompt({ userId: "user-1", prompt: "arroz" })).rejects.toThrow();
    expect(billing.commitReservation).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });
  it("cobra uma vez, preserva fonte e registra uso das duas etapas sem conteúdo", async () => {
    const result = await researchRecipeFromPrompt({ userId: "user-1", prompt: "arroz" });
    expect(result).toEqual({ ...recipe, sourceUrl: url, sourceName: "Caderno de receitas" });
    expect(billing.reserveCredits).toHaveBeenCalledOnce();
    expect(billing.commitReservation).toHaveBeenCalledWith(
      expect.objectContaining({ actualAmount: 1 }),
    );
    expect(recorder.finish).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        usage: { promptTokens: 20, completionTokens: 30, totalTokens: 50 },
        metadata: expect.objectContaining({ providerCostUsd: 0.008, sourceCount: 1 }),
      }),
    );
    expect(recorder.finish).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        usage: { promptTokens: 40, completionTokens: 60, totalTokens: 100 },
      }),
    );
    expect(model).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ extraBody: expect.objectContaining({ max_tool_calls: 1 }) }),
    );
    expect(JSON.stringify(recorder.finish.mock.calls)).not.toContain("Cozinhe o arroz");
  });
  it("libera a reserva quando a estrutura final não contém preparo", async () => {
    generate.mockResolvedValue({ object: { ...recipe, preparation: null }, usage: {} });
    await expect(researchRecipeFromPrompt({ userId: "user-1", prompt: "arroz" })).rejects.toThrow();
    expect(billing.releaseReservation).toHaveBeenCalledOnce();
    expect(billing.commitReservation).not.toHaveBeenCalled();
  });
  it("mantém o título da fonte dentro do limite aceito ao salvar a prévia", async () => {
    const research = foundResearch();
    research.sources = research.sources.map((source) => ({
      ...source,
      title: "Fonte de receita ".repeat(30),
    }));
    generateText.mockResolvedValue(research);
    const result = await researchRecipeFromPrompt({ userId: "user-1", prompt: "arroz" });
    expect(result.sourceName).toHaveLength(200);
    expect(result.sourceUrl).toBe(url);
    expect(billing.commitReservation).toHaveBeenCalledOnce();
  });
});
