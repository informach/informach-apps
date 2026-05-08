import { beforeEach, describe, expect, it, vi } from "vitest";

type WithCreditsOptions = {
  call: (input: { reservation: { id: string } }) => Promise<unknown>;
};

const withCreditsMock = vi.hoisted(() => vi.fn());
const createOpenRouterMock = vi.hoisted(() => vi.fn());
const openRouterModelMock = vi.hoisted(() => vi.fn((modelId: string) => ({ modelId })));
const openRouterWebSearchMock = vi.hoisted(() => vi.fn(() => ({ type: "web_search" })));
const generateTextMock = vi.hoisted(() => vi.fn());
const parserGenerateMock = vi.hoisted(() => vi.fn());
const getAgentMock = vi.hoisted(() => vi.fn(() => ({ generate: parserGenerateMock })));
const getMastraMock = vi.hoisted(() => vi.fn(() => ({ getAgent: getAgentMock })));
const recorderMock = vi.hoisted(() => ({
  start: vi.fn(),
  finish: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@informach/ai-core", () => ({
  withCredits: withCreditsMock,
  // Passthrough — testes existentes validam o comportamento sem retry
  // transitório; cobertura do `withRetry` em si vive em `packages/ai-core`.
  withRetry: <T>(fn: () => Promise<T>) => fn(),
}));
vi.mock("@informach/ai-core/providers", () => ({
  createOpenRouter: createOpenRouterMock,
}));
vi.mock("ai", () => ({
  generateText: generateTextMock,
}));
vi.mock("@/ai", () => ({
  getMastra: getMastraMock,
}));
vi.mock("@/ai/agent-run-recorder", () => ({
  agentRunRecorder: recorderMock,
}));
vi.mock("@/features/billing/service", () => ({
  billing: { test: true },
}));
vi.mock("@/lib/env", () => ({
  env: {
    OPENROUTER_API_KEY: "sk-or-test",
    OPENROUTER_HTTP_REFERER: "https://cozya.app",
    OPENROUTER_X_TITLE: "Cozya",
  },
}));
vi.mock("./_shared", () => ({
  normalizeUsage: (raw: unknown) => {
    const usage = (raw ?? {}) as Record<string, unknown>;
    const promptTokens = typeof usage.inputTokens === "number" ? usage.inputTokens : 0;
    const completionTokens = typeof usage.outputTokens === "number" ? usage.outputTokens : 0;
    const totalTokens =
      typeof usage.totalTokens === "number" ? usage.totalTokens : promptTokens + completionTokens;
    return { promptTokens, completionTokens, totalTokens };
  },
}));

describe("researchRecipeFromPrompt", () => {
  beforeEach(() => {
    // `getOpenRouter()` em `@/lib/openrouter` é um helper cached por módulo.
    // Resetar o cache entre testes garante que cada `it` reinvoque
    // `createOpenRouter` (mock) — sem isso, só o primeiro teste registra a
    // chamada e os asserts subsequentes falham.
    vi.resetModules();
    withCreditsMock.mockReset();
    generateTextMock.mockReset();
    parserGenerateMock.mockReset();
    createOpenRouterMock.mockClear();
    openRouterModelMock.mockClear();
    openRouterWebSearchMock.mockClear();
    getMastraMock.mockClear();
    getAgentMock.mockClear();
    recorderMock.start.mockClear();
    recorderMock.finish.mockClear();

    withCreditsMock.mockImplementation(async (opts: WithCreditsOptions) => ({
      result: await opts.call({ reservation: { id: "reservation-1" } }),
    }));
    createOpenRouterMock.mockReturnValue(
      Object.assign(openRouterModelMock, {
        tools: { webSearch: openRouterWebSearchMock },
      }),
    );
  });

  it("returns an invalid recipe result for search misses instead of throwing inside withCredits", async () => {
    const { researchRecipeFromPrompt } = await import("./research-recipe-from-prompt-service");
    generateTextMock.mockResolvedValue({
      text: "NAO_ENCONTRADA",
      usage: { inputTokens: 10, outputTokens: 2, totalTokens: 12 },
      steps: [{ toolCalls: [{ toolName: "web_search" }] }],
    });

    const result = await researchRecipeFromPrompt({
      userId: "user-1",
      prompt: "receita famosa que não existe",
    });

    expect(result).toMatchObject({
      isValidRecipe: false,
      reason: expect.any(String),
      name: null,
      ingredients: null,
      preparation: null,
      finishing: null,
    });
    expect(withCreditsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: { type: "user", id: "user-1" },
        feature: "cozya.recipe.generate_from_prompt",
        computeActualCost: expect.any(Function),
      }),
    );
    expect(parserGenerateMock).not.toHaveBeenCalled();
    expect(recorderMock.finish).toHaveBeenCalledWith({
      runId: "reservation-1",
      status: "succeeded",
      usage: { promptTokens: 10, completionTokens: 2, totalTokens: 12 },
      metadata: { outcome: "not_found", usedWebSearch: true },
    });
  });

  it("records usage for both the web research and structured parse calls", async () => {
    const { researchRecipeFromPrompt } = await import("./research-recipe-from-prompt-service");
    const parsedRecipe = {
      isValidRecipe: true,
      reason: null,
      name: "Bolo simples",
      ingredients: "2 ovos\n1 xicara de farinha",
      preparation: "Misture tudo e asse.",
      finishing: null,
    };
    generateTextMock.mockResolvedValue({
      text: "Receita popular de bolo simples com ingredientes e modo de preparo detalhados.",
      usage: { inputTokens: 20, outputTokens: 30, totalTokens: 50 },
      steps: [{ toolCalls: [{ toolName: "web_search" }] }],
    });
    parserGenerateMock.mockResolvedValue({
      object: parsedRecipe,
      usage: { inputTokens: 40, outputTokens: 60, totalTokens: 100 },
    });

    const result = await researchRecipeFromPrompt({
      userId: "user-1",
      prompt: "bolo simples",
    });

    expect(result).toEqual(parsedRecipe);
    expect(createOpenRouterMock).toHaveBeenCalledWith({
      apiKey: "sk-or-test",
      headers: {
        "HTTP-Referer": "https://cozya.app",
        "X-OpenRouter-Title": "Cozya",
      },
    });
    expect(recorderMock.finish).toHaveBeenNthCalledWith(1, {
      runId: "reservation-1",
      status: "succeeded",
      usage: { promptTokens: 20, completionTokens: 30, totalTokens: 50 },
      metadata: { outcome: "research_found", usedWebSearch: true },
    });
    expect(recorderMock.finish).toHaveBeenNthCalledWith(2, {
      runId: "reservation-1",
      status: "succeeded",
      usage: { promptTokens: 40, completionTokens: 60, totalTokens: 100 },
      metadata: { outcome: "parsed" },
    });
  });
});
