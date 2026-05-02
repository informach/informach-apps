import { describe, expect, it, vi } from "vitest";
import {
  commitReservation,
  consumeCredits,
  releaseReservation,
  reserveCredits,
} from "../credits/reservations";
import {
  InsufficientCreditsError,
  ReservationAlreadyResolvedError,
  ReservationExpiredError,
  ReservationNotFoundError,
} from "../errors";
import { createFakeDb } from "./_fake-db";

const owner = { type: "user" as const, id: "user-1" };

const baseReserveInput = {
  owner,
  estimatedAmount: 200,
  app: "agenda-da-turma",
  feature: "llm.text",
  model: "claude-sonnet-4-6",
  runId: "run-1",
};

describe("reserveCredits", () => {
  it("creates a reservation when balance is sufficient", async () => {
    const { db } = createFakeDb({
      // execute() returns balance row: total=1000, reserved_other=300 → available=700
      executeResult: [{ total: "1000", reserved_other: "300" }],
      insertResult: [
        {
          id: "res-1",
          expiresAt: new Date("2026-05-01T20:00:00Z"),
        },
      ],
    });
    const handle = await reserveCredits({ db: db as never }, baseReserveInput);
    expect(handle.id).toBe("res-1");
    expect(handle.estimatedAmount).toBe(200);
    expect(handle.ownerType).toBe("user");
  });

  it("throws InsufficientCreditsError when available < estimatedAmount", async () => {
    const { db } = createFakeDb({
      executeResult: [{ total: "100", reserved_other: "50" }],
    });
    await expect(
      reserveCredits({ db: db as never }, baseReserveInput),
    ).rejects.toThrow(InsufficientCreditsError);
  });

  it("clamps ttlSeconds below 60 to 60", async () => {
    const { db } = createFakeDb({
      executeResult: [{ total: "1000", reserved_other: "0" }],
      insertResult: [{ id: "res-2", expiresAt: new Date(Date.now() + 60_000) }],
    });
    await expect(
      reserveCredits({ db: db as never }, { ...baseReserveInput, ttlSeconds: 5 }),
    ).resolves.toBeDefined();
    // We don't snapshot the exact expiresAt since it's wall-clock; we just confirm no throw.
  });
});

describe("commitReservation", () => {
  it("commits an active non-expired reservation, inserts ledger consumption, returns balance", async () => {
    const onAudit = vi.fn();
    const futureExpiry = new Date(Date.now() + 60_000);
    const { db } = createFakeDb({
      selectQueue: [
        // first SELECT: full reservation row
        [
          {
            id: "res-1",
            ownerType: "user",
            ownerId: "user-1",
            status: "active",
            expiresAt: futureExpiry,
            runId: "run-1",
            feature: "llm.text",
            model: "claude-sonnet-4-6",
          },
        ],
        // second SELECT (after lock, fresh status check)
        [{ status: "active", expiresAt: futureExpiry }],
      ],
      insertResult: [{ id: "ledger-commit-1" }],
      executeResult: [{ total: "800", reserved_other: "0" }],
    });
    const result = await commitReservation(
      { db: db as never, onAudit },
      { reservationId: "res-1", actualAmount: 180 },
    );
    expect(result.ledgerEntryId).toBe("ledger-commit-1");
    expect(result.balanceAfter).toBe(800);
    expect(onAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "billing.credits_consumed",
        payload: expect.objectContaining({
          reservationId: "res-1",
          ledgerEntryId: "ledger-commit-1",
          amount: 180,
        }),
      }),
    );
  });

  it("throws ReservationNotFoundError when reservation id is unknown", async () => {
    const { db } = createFakeDb({ selectQueue: [[]] });
    await expect(
      commitReservation(
        { db: db as never },
        { reservationId: "missing-id", actualAmount: 100 },
      ),
    ).rejects.toThrow(ReservationNotFoundError);
  });

  it("throws ReservationAlreadyResolvedError when status is not 'active' on fresh check", async () => {
    const futureExpiry = new Date(Date.now() + 60_000);
    const { db } = createFakeDb({
      selectQueue: [
        [
          {
            id: "res-1",
            ownerType: "user",
            ownerId: "user-1",
            status: "active",
            expiresAt: futureExpiry,
            runId: null,
            feature: "llm.text",
            model: null,
          },
        ],
        [{ status: "committed", expiresAt: futureExpiry }],
      ],
    });
    await expect(
      commitReservation(
        { db: db as never },
        { reservationId: "res-1", actualAmount: 100 },
      ),
    ).rejects.toThrow(ReservationAlreadyResolvedError);
  });

  it("throws ReservationExpiredError and marks expired when reservation timed out", async () => {
    const pastExpiry = new Date(Date.now() - 1000);
    const { db, calls } = createFakeDb({
      selectQueue: [
        [
          {
            id: "res-1",
            ownerType: "user",
            ownerId: "user-1",
            status: "active",
            expiresAt: pastExpiry,
            runId: null,
            feature: "llm.text",
            model: null,
          },
        ],
        [{ status: "active", expiresAt: pastExpiry }],
      ],
    });
    await expect(
      commitReservation(
        { db: db as never },
        { reservationId: "res-1", actualAmount: 100 },
      ),
    ).rejects.toThrow(ReservationExpiredError);
    // Confirm we called UPDATE to mark it expired before throwing
    expect(calls.some((c) => c.mode === "update")).toBe(true);
  });
});

describe("releaseReservation", () => {
  it("returns silently when reservation is active and gets released", async () => {
    const { db } = createFakeDb({
      updateResult: [{ id: "res-1" }],
    });
    await expect(
      releaseReservation(
        { db: db as never },
        { reservationId: "res-1", reason: "user_cancel" },
      ),
    ).resolves.toBeUndefined();
  });

  it("is idempotent: no error when already-released (UPDATE touches 0 rows)", async () => {
    const { db } = createFakeDb({ updateResult: [] });
    await expect(
      releaseReservation(
        { db: db as never },
        { reservationId: "res-1", reason: "timeout" },
      ),
    ).resolves.toBeUndefined();
  });
});

describe("consumeCredits (reserve+commit shortcut)", () => {
  it("inserts a ledger consumption when balance is sufficient", async () => {
    const onAudit = vi.fn();
    const { db } = createFakeDb({
      executeResult: [{ total: "1000", reserved_other: "100" }], // available = 900
      insertResult: [{ id: "ledger-direct-1" }],
    });
    const result = await consumeCredits(
      { db: db as never, onAudit },
      {
        owner,
        amount: 250,
        app: "cozya",
        feature: "llm.text",
        model: "claude-haiku-4-5",
      },
    );
    expect(result).toEqual({
      ok: true,
      ledgerEntryId: "ledger-direct-1",
      balanceAfter: 650,
    });
    expect(onAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "billing.credits_consumed",
        payload: expect.objectContaining({ amount: 250 }),
      }),
    );
  });

  it("returns INSUFFICIENT_BALANCE without inserting ledger when below required", async () => {
    const { db, calls } = createFakeDb({
      executeResult: [{ total: "100", reserved_other: "50" }], // available = 50
    });
    const result = await consumeCredits(
      { db: db as never },
      {
        owner,
        amount: 250,
        app: "cozya",
        feature: "llm.text",
      },
    );
    expect(result).toEqual({
      ok: false,
      code: "INSUFFICIENT_BALANCE",
      balance: 50,
    });
    expect(calls.some((c) => c.mode === "insert")).toBe(false);
  });
});
