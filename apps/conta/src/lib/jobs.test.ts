import { beforeEach, describe, expect, it, vi } from "vitest";

const jobs = vi.hoisted(() => ({
  native: vi.fn(),
  legacy: vi.fn(),
  future: vi.fn(),
  coordination: vi.fn(),
  release: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@informach/db", () => ({
  db: {},
  recordJobRun: (_meta: unknown, run: () => unknown) => run(),
}));
vi.mock("@informach/billing/sweepers", () => ({ releaseExpiredReservations: jobs.release }));
vi.mock("@informach/billing/legacy-contract-jobs", () => ({
  runLegacyContractMaintenance: jobs.legacy,
}));
vi.mock("@informach/billing/legacy-future-jobs", () => ({ runLegacyFutureRecovery: jobs.future }));
vi.mock("@informach/billing/legacy-coordination-jobs", () => ({
  runLegacyCoordinationRecovery: jobs.coordination,
}));
vi.mock("@informach/account/closure", () => ({ finalizeReadyWebClosures: vi.fn() }));
vi.mock("@informach/account/closure-billing", () => ({ processBillingWebClosures: vi.fn() }));
vi.mock("@informach/account/closure-family", () => ({ processFamilyWebClosures: vi.fn() }));
vi.mock("@informach/account/departure-reviews", () => ({ purgeExpiredDepartureReviews: vi.fn() }));
vi.mock("./billing", () => ({
  getBillingMaintenance: () => ({ commerce: { runReconciliation: jobs.native } }),
}));
vi.mock("./observability", () => ({ reportOperationalError: vi.fn() }));

import { runBillingJob } from "./jobs";

describe("central financial scheduler", () => {
  beforeEach(() => {
    for (const job of Object.values(jobs)) job.mockReset();
    jobs.native.mockResolvedValue({ failed: 0, processed: 2 });
    for (const job of [jobs.legacy, jobs.future, jobs.coordination])
      job.mockResolvedValue({ failed: 0, checked: 1 });
    jobs.release.mockResolvedValue({ released: 1 });
  });
  it("drains expired reservations in the family and former app scopes without touching independent products", async () => {
    const result = await runBillingJob();
    const scopes = jobs.release.mock.calls.map(([deps]) => deps.app);
    expect(scopes).toEqual(
      expect.arrayContaining([
        "compasso",
        "cozya",
        "agenda-da-turma",
        "missao-saber",
        "bora-treinar",
        "dia-de-estrela",
      ]),
    );
    expect(scopes).toHaveLength(6);
    expect(scopes).not.toContain("edi");
    expect(scopes).not.toContain("recreio");
    expect(result).toMatchObject({ processed: 2, released: 6, legacyChecked: 1 });
  });
  it("still drains reservations when provider reconciliation fails and returns an operational failure", async () => {
    jobs.native.mockRejectedValue(new Error("provider_unavailable"));
    await expect(runBillingJob()).rejects.toThrow("CompassoBillingReconciliationIncomplete");
    expect(jobs.release).toHaveBeenCalledTimes(6);
    expect(jobs.coordination).toHaveBeenCalledOnce();
  });
  it("reports an expiry failure while finishing the other scopes", async () => {
    jobs.release.mockImplementation(async ({ app }) => {
      if (app === "cozya") throw new Error("expiry_failed");
      return { released: 1 };
    });
    await expect(runBillingJob()).rejects.toThrow("CompassoBillingReconciliationIncomplete");
    expect(jobs.release).toHaveBeenCalledTimes(6);
  });
});
