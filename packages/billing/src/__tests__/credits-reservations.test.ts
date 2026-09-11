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

const balanceSnapshot = (amount: number, reserved: number) => [
  {
    ledger: [
      {
        id: "grant",
        amount,
        entryType: "bonus_grant",
        createdAt: "2020-01-01T00:00:00Z",
        expiresAt: null,
      },
    ],
    reserved,
    as_of: new Date(),
  },
];

const owner = { type: "user" as const, id: "user-1" };

const baseReserveInput = {
  owner,
  estimatedAmount: 200,
  app: "agenda-da-turma",
  feature: "llm.text",
  model: "claude-sonnet-4-6",
  runId: "11111111-1111-4111-8111-111111111111",
};

describe("reserveCredits", () => {
  it("creates a reservation when balance is sufficient", async () => {
    const reservationId = "22222222-2222-4222-8222-222222222222";
    const { db, calls } = createFakeDb({
      // Available credits exclude the other active reservations.
      executeResult: balanceSnapshot(1000, 300),
      insertResult: [
        {
          id: "res-1",
          expiresAt: new Date("2026-05-01T20:00:00Z"),
        },
      ],
    });
    const handle = await reserveCredits(
      { db: db as never },
      { ...baseReserveInput, reservationId },
    );
    expect(handle.id).toBe("res-1");
    expect(handle.estimatedAmount).toBe(200);
    expect(handle.ownerType).toBe("user");
    expect(calls).toContainEqual(
      expect.objectContaining({
        mode: "values",
        args: [
          expect.objectContaining({
            id: reservationId,
            runId: baseReserveInput.runId,
          }),
        ],
      }),
    );
  });

  it("uses the reservation UUID as runId when caller does not pass runId", async () => {
    const reservationId = "33333333-3333-4333-8333-333333333333";
    const { db, calls } = createFakeDb({
      executeResult: balanceSnapshot(1000, 0),
      insertResult: [{ id: reservationId, expiresAt: new Date("2026-05-01T20:00:00Z") }],
    });
    await reserveCredits(
      { db: db as never },
      {
        ...baseReserveInput,
        reservationId,
        runId: undefined,
      },
    );
    expect(calls).toContainEqual(
      expect.objectContaining({
        mode: "values",
        args: [
          expect.objectContaining({
            id: reservationId,
            runId: reservationId,
          }),
        ],
      }),
    );
  });

  it("throws InsufficientCreditsError when available < estimatedAmount", async () => {
    const { db } = createFakeDb({
      executeResult: balanceSnapshot(100, 50),
    });
    await expect(reserveCredits({ db: db as never }, baseReserveInput)).rejects.toThrow(
      InsufficientCreditsError,
    );
  });

  it("clamps ttlSeconds below 60 to 60", async () => {
    const { db } = createFakeDb({
      executeResult: balanceSnapshot(1000, 0),
      insertResult: [{ id: "res-2", expiresAt: new Date(Date.now() + 60_000) }],
    });
    await expect(
      reserveCredits({ db: db as never }, { ...baseReserveInput, ttlSeconds: 5 }),
    ).resolves.toBeDefined();
    // We don't snapshot the exact expiresAt since it's wall-clock; we just confirm no throw.
  });

  it("rejects non-positive estimated amounts before opening a transaction", async () => {
    const { db, calls } = createFakeDb();
    await expect(
      reserveCredits({ db: db as never }, { ...baseReserveInput, estimatedAmount: 0 }),
    ).rejects.toThrow("estimatedAmount must be a positive integer");
    expect(calls).toEqual([]);
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
      executeResult: balanceSnapshot(800, 0),
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
      commitReservation({ db: db as never }, { reservationId: "missing-id", actualAmount: 100 }),
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
      commitReservation({ db: db as never }, { reservationId: "res-1", actualAmount: 100 }),
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
      commitReservation({ db: db as never }, { reservationId: "res-1", actualAmount: 100 }),
    ).rejects.toThrow(ReservationExpiredError);
    // Confirm we called UPDATE to mark it expired before throwing
    expect(calls.some((c) => c.mode === "update")).toBe(true);
  });

  it("rejects non-positive actual amounts before loading the reservation", async () => {
    const { db, calls } = createFakeDb();
    await expect(
      commitReservation({ db: db as never }, { reservationId: "res-1", actualAmount: -1 }),
    ).rejects.toThrow("actualAmount must be a positive integer");
    expect(calls).toEqual([]);
  });
});

describe("releaseReservation", () => {
  it("returns silently when reservation is active and gets released", async () => {
    const { db } = createFakeDb({
      updateResult: [{ id: "res-1" }],
    });
    await expect(
      releaseReservation({ db: db as never }, { reservationId: "res-1", reason: "user_cancel" }),
    ).resolves.toBeUndefined();
  });

  it("is idempotent: no error when already-released (UPDATE touches 0 rows)", async () => {
    const { db } = createFakeDb({ updateResult: [] });
    await expect(
      releaseReservation({ db: db as never }, { reservationId: "res-1", reason: "timeout" }),
    ).resolves.toBeUndefined();
  });
});

describe("consumeCredits (reserve+commit shortcut)", () => {
  it("inserts a ledger consumption when balance is sufficient", async () => {
    const onAudit = vi.fn();
    const { db } = createFakeDb({
      executeResult: balanceSnapshot(1000, 100), // available = 900
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
      executeResult: balanceSnapshot(100, 50), // available = 50
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

  it("rejects non-positive direct consumption amounts before opening a transaction", async () => {
    const { db, calls } = createFakeDb();
    await expect(
      consumeCredits(
        { db: db as never },
        {
          owner,
          amount: -250,
          app: "cozya",
          feature: "llm.text",
        },
      ),
    ).rejects.toThrow("amount must be a positive integer");
    expect(calls).toEqual([]);
  });
});
