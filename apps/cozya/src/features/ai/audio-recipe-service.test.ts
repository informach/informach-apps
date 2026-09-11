import { beforeEach, describe, expect, it, vi } from "vitest";

const transcribeAudio = vi.hoisted(() => vi.fn());
const generate = vi.hoisted(() => vi.fn());
const billing = vi.hoisted(() => ({
  reserveCredits: vi.fn(),
  commitReservation: vi.fn(),
  releaseReservation: vi.fn(),
}));
const recorder = vi.hoisted(() => ({ start: vi.fn(), finish: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@informach/ai-core/transcription", () => ({ transcribeAudio }));
vi.mock("@/ai", () => ({ getMastra: () => ({ getAgent: () => ({ generate }) }) }));
vi.mock("@/ai/agent-run-recorder", () => ({ agentRunRecorder: recorder }));
vi.mock("@/features/billing/service", () => ({ billing }));
vi.mock("@/lib/env", () => ({ env: { OPENROUTER_API_KEY: "test" } }));
vi.mock("@/lib/openrouter", () => ({ openRouterAttributionHeaders: () => ({}) }));

import { recipeFromAudio } from "./audio-recipe-service";

describe("captura completa por voz", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    billing.reserveCredits.mockImplementation(async (input) => ({ id: input.reservationId }));
    billing.commitReservation.mockResolvedValue({ ledgerEntryId: "ledger", balanceAfter: 0 });
    billing.releaseReservation.mockResolvedValue(undefined);
    transcribeAudio.mockResolvedValue({ text: "Omelete: bata dois ovos e cozinhe na frigideira." });
    generate.mockResolvedValue({
      object: {
        servings: null,
        totalMinutes: null,
        sourceUrl: null,
        sourceName: null,
        isValidRecipe: true,
        reason: null,
        name: "Omelete",
        ingredients: "2 ovos",
        preparation: "Bata os ovos.\nCozinhe na frigideira.",
        finishing: null,
      },
      usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
    });
  });
  it("termina com apenas um crédito e uma única reserva", async () => {
    const result = await recipeFromAudio({
      userId: "a",
      audio: new Blob(["audio"]),
      mode: "recipe",
    });
    expect(result.name).toBe("Omelete");
    expect(billing.reserveCredits).toHaveBeenCalledTimes(1);
    expect(billing.reserveCredits).toHaveBeenCalledWith(
      expect.objectContaining({ estimatedAmount: 1 }),
    );
    expect(billing.commitReservation).toHaveBeenCalledWith(
      expect.objectContaining({ actualAmount: 1 }),
    );
    expect(JSON.stringify(recorder.finish.mock.calls)).not.toContain("bata dois ovos");
  });
  it("não cobra transcrição isolada quando o parsing falha", async () => {
    generate.mockRejectedValue(new Error("provider unavailable"));
    await expect(
      recipeFromAudio({ userId: "a", audio: new Blob(["audio"]), mode: "recipe" }),
    ).rejects.toThrow();
    expect(transcribeAudio).toHaveBeenCalledOnce();
    expect(billing.releaseReservation).toHaveBeenCalledOnce();
    expect(billing.commitReservation).not.toHaveBeenCalled();
  });
});
