import { describe, expect, it, vi } from "vitest";
import { type AgentRunStore, calculateTokenUsage, createAgentRunRecorder } from "../telemetry";

function makeStore(): AgentRunStore {
  return {
    insertRun: vi.fn(async () => undefined),
    updateRun: vi.fn(async () => undefined),
    insertUsage: vi.fn(async () => undefined),
  };
}

describe("AgentRunRecorder", () => {
  it("start() insere com status 'running' e metadata opcional", async () => {
    const store = makeStore();
    const recorder = createAgentRunRecorder({ store });
    await recorder.start({
      runId: "run-1",
      app: "cozya",
      agent: "triagem",
      metadata: { traceId: "abc" },
    });
    expect(store.insertRun).toHaveBeenCalledWith({
      runId: "run-1",
      app: "cozya",
      agent: "triagem",
      status: "running",
      metadata: { traceId: "abc" },
    });
  });

  it("finish() com usage atualiza run E insere usage log", async () => {
    const store = makeStore();
    const recorder = createAgentRunRecorder({ store });
    await recorder.finish({
      runId: "run-1",
      status: "succeeded",
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    });
    expect(store.updateRun).toHaveBeenCalledWith(
      expect.objectContaining({ runId: "run-1", status: "succeeded" }),
    );
    expect(store.insertUsage).toHaveBeenCalledWith({
      runId: "run-1",
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    });
  });

  it("finish() sem usage NÃO insere usage log (run com erro)", async () => {
    const store = makeStore();
    const recorder = createAgentRunRecorder({ store });
    await recorder.finish({
      runId: "run-1",
      status: "failed",
      metadata: { error: "anthropic 503" },
    });
    expect(store.updateRun).toHaveBeenCalledWith(
      expect.objectContaining({ runId: "run-1", status: "failed" }),
    );
    expect(store.insertUsage).not.toHaveBeenCalled();
  });

  it("finish() rejeita status não terminal antes de gravar finishedAt", async () => {
    const store = makeStore();
    const recorder = createAgentRunRecorder({ store });
    await expect(
      Reflect.apply(recorder.finish, recorder, [{ runId: "run-1", status: "running" }]),
    ).rejects.toThrow("Agent run finish status must be terminal");
    expect(store.updateRun).not.toHaveBeenCalled();
    expect(store.insertUsage).not.toHaveBeenCalled();
  });

  it("finish() preenche finishedAt com Date atual", async () => {
    const store = makeStore();
    const recorder = createAgentRunRecorder({ store });
    const before = Date.now();
    await recorder.finish({ runId: "run-1", status: "succeeded" });
    const after = Date.now();
    const call = (store.updateRun as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(call?.finishedAt).toBeInstanceOf(Date);
    expect(call?.finishedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(call?.finishedAt.getTime()).toBeLessThanOrEqual(after);
  });
});

describe("calculateTokenUsage", () => {
  it("soma prompt+completion em totalTokens", () => {
    expect(calculateTokenUsage(100, 50)).toEqual({
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
    });
  });

  it("aceita zero em ambos os lados", () => {
    expect(calculateTokenUsage(0, 0).totalTokens).toBe(0);
  });
});
