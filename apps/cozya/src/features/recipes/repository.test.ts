import { beforeEach, describe, expect, it, vi } from "vitest";
import { insertRecipeWithinFreeLimit, type NewRecipePayload } from "./repository";

const dbMocks = vi.hoisted(() => {
  const db = {
    transaction: vi.fn(),
  };
  const tx = {
    execute: vi.fn(),
    insert: vi.fn(),
    select: vi.fn(),
  };

  return {
    and: vi.fn(),
    count: vi.fn(() => "count"),
    db,
    desc: vi.fn((value: unknown) => ({ desc: value })),
    eq: vi.fn((left: unknown, right: unknown) => ({ left, right })),
    sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
      strings: Array.from(strings),
      values,
    })),
    tx,
  };
});

vi.mock("server-only", () => ({}));

vi.mock("@informach/db/schema", () => ({
  cozyaRecipes: {
    createdAt: "created_at",
    id: "id",
    isFavorite: "is_favorite",
    userId: "user_id",
  },
}));

vi.mock("@informach/db", () => ({
  and: dbMocks.and,
  count: dbMocks.count,
  db: dbMocks.db,
  desc: dbMocks.desc,
  eq: dbMocks.eq,
  sql: dbMocks.sql,
}));

const payload: NewRecipePayload = {
  userId: "user_123",
  name: "Bolo de cenoura",
  ingredients: "cenoura\nfarinha\novos",
  preparation: "Misture tudo e asse.",
  finishing: null,
  isFavorite: false,
};

const recipe = {
  id: "5c82420f-4ac7-42c7-b6fd-9d65c5af86f5",
  ...payload,
  createdAt: new Date("2026-05-06T00:00:00.000Z"),
  updatedAt: new Date("2026-05-06T00:00:00.000Z"),
};

function selectCountResult(current: number) {
  return {
    from: vi.fn(() => ({
      where: vi.fn(() => Promise.resolve([{ count: current }])),
    })),
  };
}

function insertResult(rows: unknown[]) {
  return {
    values: vi.fn(() => ({
      returning: vi.fn(() => Promise.resolve(rows)),
    })),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  dbMocks.tx.execute.mockResolvedValue([]);
  dbMocks.db.transaction.mockImplementation(async (fn) => fn(dbMocks.tx));
});

describe("insertRecipeWithinFreeLimit", () => {
  it("serializes the count and insert inside one transaction", async () => {
    dbMocks.tx.select.mockReturnValue(selectCountResult(14));
    dbMocks.tx.insert.mockReturnValue(insertResult([recipe]));

    const result = await insertRecipeWithinFreeLimit(payload, 15);

    expect(result).toEqual({ ok: true, recipe });
    expect(dbMocks.db.transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "read committed",
    });
    expect(dbMocks.tx.execute).toHaveBeenCalledTimes(1);
    expect(dbMocks.tx.insert).toHaveBeenCalledTimes(1);
    expect(dbMocks.sql.mock.calls[0]?.[1]).toBe("cozya:recipes:user_123");
  });

  it("does not insert when the lifetime Free limit is reached", async () => {
    dbMocks.tx.select.mockReturnValue(selectCountResult(15));

    const result = await insertRecipeWithinFreeLimit(payload, 15);

    expect(result).toEqual({ ok: false, current: 15 });
    expect(dbMocks.tx.execute).toHaveBeenCalledTimes(1);
    expect(dbMocks.tx.insert).not.toHaveBeenCalled();
  });
});
