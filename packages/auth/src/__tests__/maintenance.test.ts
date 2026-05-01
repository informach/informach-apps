import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const dbDeleteWhereChain = {
  returning: vi.fn(async () => [{ id: "v1" }, { id: "v2" }]),
};
const dbDeleteChain = {
  where: vi.fn(() => dbDeleteWhereChain),
};
const dbUpdateWhereChain = {
  returning: vi.fn(async () => [{ id: "i1" }]),
};
const dbUpdateSetChain = {
  where: vi.fn(() => dbUpdateWhereChain),
};
const dbUpdateChain = {
  set: vi.fn(() => dbUpdateSetChain),
};

vi.mock("@informach/db", () => ({
  db: {
    delete: vi.fn(() => dbDeleteChain),
    update: vi.fn(() => dbUpdateChain),
  },
}));

vi.mock("@informach/db/schema", () => ({
  verifications: {
    __mock: "verifications",
    id: "verifications.id",
    expiresAt: "verifications.expires_at",
  },
  invitations: {
    __mock: "invitations",
    id: "invitations.id",
    status: "invitations.status",
    expiresAt: "invitations.expires_at",
  },
  rateLimit: {
    __mock: "rate_limit",
    id: "rate_limit.id",
    lastRequest: "rate_limit.last_request",
  },
}));

import {
  cleanupExpiredInvitations,
  cleanupExpiredVerifications,
  cleanupStaleRateLimit,
} from "../maintenance";

describe("cleanupExpiredVerifications", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deletes rows and returns the count", async () => {
    dbDeleteWhereChain.returning.mockResolvedValueOnce([{ id: "a" }, { id: "b" }, { id: "c" }]);
    const count = await cleanupExpiredVerifications(new Date("2025-01-01"));
    expect(count).toBe(3);
    expect(dbDeleteChain.where).toHaveBeenCalled();
  });

  it("returns 0 when nothing matches", async () => {
    dbDeleteWhereChain.returning.mockResolvedValueOnce([]);
    await expect(cleanupExpiredVerifications()).resolves.toBe(0);
  });
});

describe("cleanupExpiredInvitations", () => {
  beforeEach(() => vi.clearAllMocks());

  it("updates pending → expired and returns count", async () => {
    dbUpdateWhereChain.returning.mockResolvedValueOnce([{ id: "x" }, { id: "y" }]);
    const count = await cleanupExpiredInvitations(new Date("2025-01-01"));
    expect(count).toBe(2);
    expect(dbUpdateChain.set).toHaveBeenCalledWith({ status: "expired" });
  });
});

describe("cleanupStaleRateLimit", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deletes rows older than the threshold and returns count", async () => {
    dbDeleteWhereChain.returning.mockResolvedValueOnce([{ id: "1" }]);
    const count = await cleanupStaleRateLimit(120);
    expect(count).toBe(1);
  });

  it("uses default 3600s when not provided", async () => {
    dbDeleteWhereChain.returning.mockResolvedValueOnce([]);
    await expect(cleanupStaleRateLimit()).resolves.toBe(0);
  });
});
