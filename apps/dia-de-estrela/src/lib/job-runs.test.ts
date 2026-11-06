import { beforeEach, describe, expect, it, vi } from "vitest";

// O registro real grava no banco; aqui ele guarda o desfecho para conferir.
const recorded = vi.hoisted(() => ({
  runs: [] as Array<{ job: string; ok: boolean; result?: unknown; error?: string }>,
}));
vi.mock("@informach/db", () => ({
  recordJobRun: async (meta: { job: string }, run: () => Promise<unknown>) => {
    try {
      const result = await run();
      recorded.runs.push({ job: meta.job, ok: true, result });
      return result;
    } catch (error) {
      recorded.runs.push({ job: meta.job, ok: false, error: (error as Error).name });
      throw error;
    }
  },
}));

import { recordJobResponse } from "./job-runs";

describe("registro das rotinas que respondem com status", () => {
  beforeEach(() => {
    recorded.runs.length = 0;
  });

  it("devolve a resposta da rotina e registra os números do corpo", async () => {
    const response = await recordJobResponse("weekly-report", async () =>
      Response.json({ status: "ok", enviados: 3 }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok", enviados: 3 });
    expect(recorded.runs).toEqual([
      { job: "weekly-report", ok: true, result: { status: "ok", enviados: 3 } },
    ]);
  });

  it("registra falha quando a rotina responde erro, sem trocar a resposta do cron", async () => {
    const response = await recordJobResponse("weekly-report", async () =>
      Response.json({ status: "failed", falhas: 1 }, { status: 503 }),
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "failed", falhas: 1 });
    expect(recorded.runs).toEqual([{ job: "weekly-report", ok: false, error: "Http503" }]);
  });

  it("deixa passar um erro inesperado da rotina", async () => {
    await expect(
      recordJobResponse("weekly-report", async () => {
        throw new TypeError("quebrou");
      }),
    ).rejects.toThrow("quebrou");
    expect(recorded.runs).toEqual([{ job: "weekly-report", ok: false, error: "TypeError" }]);
  });
});
