import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const boundary = vi.hoisted(() => ({
  cancel: vi.fn(),
  clean: vi.fn(),
  otherSubscriptions: vi.fn(),
}));
vi.mock("@/lib/billing", () => ({ billing: { cancelBillingForSubject: boundary.cancel } }));
vi.mock("./cleanup", () => ({ cleanAgendaAccount: boundary.clean }));
vi.mock("./repository", () => ({ hasOtherAppSubscriptions: boundary.otherSubscriptions }));

import { prepareAgendaAccountDeletion } from "./deletion";

beforeEach(() => {
  vi.resetAllMocks();
  boundary.otherSubscriptions.mockResolvedValue(false);
});
describe("account deletion billing boundary", () => {
  it("preserves the shared identity and does not cancel this plan while another app has a subscription", async () => {
    boundary.otherSubscriptions.mockResolvedValue(true);
    await expect(prepareAgendaAccountDeletion("adult")).rejects.toThrow("outros apps Informach");
    expect(boundary.cancel).not.toHaveBeenCalled();
    expect(boundary.clean).not.toHaveBeenCalled();
  });
  it("preserves private data when cancellation is only partially successful", async () => {
    boundary.cancel.mockResolvedValue({ canceled: 1, failed: 1 });
    await expect(prepareAgendaAccountDeletion("adult")).rejects.toThrow("Sua conta foi preservada");
    expect(boundary.clean).not.toHaveBeenCalled();
  });
  it("preserves data on provider failure and permits a successful retry", async () => {
    boundary.cancel
      .mockRejectedValueOnce(new Error("provider unavailable"))
      .mockResolvedValueOnce({ canceled: 1, failed: 0 });
    await expect(prepareAgendaAccountDeletion("adult")).rejects.toThrow("provider unavailable");
    expect(boundary.clean).not.toHaveBeenCalled();
    await expect(prepareAgendaAccountDeletion("adult")).resolves.toBeUndefined();
    expect(boundary.clean).toHaveBeenCalledTimes(1);
  });
});
