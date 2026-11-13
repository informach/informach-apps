import { afterEach, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/openrouter", async () => {
  const { createOpenRouter } = await import("@informach/ai-core/providers");
  return {
    getOpenRouter: () =>
      createOpenRouter({ apiKey: "synthetic-test-key", baseURL: "https://ai.example.test/v1" }),
  };
});

import { generateNoticeExtraction } from "./extract";

afterEach(() => vi.unstubAllGlobals());
const input = { text: "Synthetic school notice", source: "other", publishedAt: null };
const context = { subjectNames: ["Synthetic"], currentYear: "2026" };
it("sends a single bounded request through the installed Mastra and provider adapters", async () => {
  const requests: Record<string, unknown>[] = [];
  vi.stubGlobal("fetch", async (_url: unknown, init: RequestInit) => {
    requests.push(JSON.parse(String(init.body)));
    const result = JSON.stringify({ actions: [], warnings: [], publicationReference: null });
    return Response.json({
      id: "synthetic",
      object: "chat.completion",
      created: 1,
      model: "openai/gpt-4o",
      choices: [
        { index: 0, message: { role: "assistant", content: result }, finish_reason: "stop" },
      ],
      usage: { prompt_tokens: 4000, completion_tokens: 2000, total_tokens: 6000 },
    });
  });
  const output = await generateNoticeExtraction(input, null, context);
  expect(output.extraction.actions).toEqual([]);
  expect(output.usage).toMatchObject({ inputTokens: 4000, outputTokens: 2000 });
  expect(requests).toHaveLength(1);
  expect(requests[0]).toMatchObject({
    model: "openai/gpt-4o",
    max_tokens: 4096,
    provider: {
      only: ["openai"],
      allow_fallbacks: false,
      max_price: { prompt: 2.5, completion: 10 },
    },
    plugins: [{ id: "file-parser", pdf: { engine: "native" } }],
  });
});
it("does not retry a failing paid provider request", async () => {
  const fetch = vi.fn(
    async () =>
      new Response(JSON.stringify({ error: { message: "Synthetic unavailable" } }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      }),
  );
  vi.stubGlobal("fetch", fetch);
  await expect(generateNoticeExtraction(input, null, context)).rejects.toThrow();
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("refuses unbounded contextual metadata before contacting the provider", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  await expect(
    generateNoticeExtraction(input, null, { ...context, subjectNames: ["a".repeat(25000)] }),
  ).rejects.toThrow("AI_CONTEXT_TOO_LARGE");
  expect(fetch).not.toHaveBeenCalled();
});
