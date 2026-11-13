import { beforeEach, describe, expect, it, vi } from "vitest";

const jobs = vi.hoisted(() => ({ departure: vi.fn(), cleanup: vi.fn() }));
vi.mock("@informach/account/departure-jobs", () => ({ runAccountDepartureBatch: jobs.departure }));
vi.mock("../features/account/closure-service", () => ({ processMissaoClosures: vi.fn() }));
vi.mock("../features/account/departure-service", () => ({
  processMissaoDepartureReviews: vi.fn(),
}));
vi.mock("../features/study-access/repository", () => ({ cleanupStudyAccess: jobs.cleanup }));

import { runAccountMaintenance } from "./account-maintenance";

describe("maintenance after retiring the legacy billing cron", () => {
  beforeEach(() => {
    jobs.departure.mockReset().mockResolvedValue({ completed: 1, failed: 0 });
    jobs.cleanup.mockReset().mockResolvedValue(undefined);
  });
  it("cleans study credentials before departure reviews and preserves the batch result", async () => {
    jobs.departure.mockImplementation(async () => {
      expect(jobs.cleanup).toHaveResolved();
      return { completed: 1, failed: 0 };
    });
    expect(await runAccountMaintenance()).toEqual({ completed: 1, failed: 0 });
  });
  it("advances consented work despite housekeeping failure, but reports the failed job", async () => {
    jobs.cleanup.mockRejectedValue(new Error("housekeeping_failed"));
    await expect(runAccountMaintenance()).rejects.toThrow("housekeeping_failed");
    expect(jobs.departure).toHaveBeenCalledOnce();
  });
  it("keeps housekeeping when the departure batch fails", async () => {
    jobs.departure.mockRejectedValue(new Error("departure_failed"));
    await expect(runAccountMaintenance()).rejects.toThrow("departure_failed");
    expect(jobs.cleanup).toHaveBeenCalledOnce();
  });
});
