import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  deleteRecipeForUser,
  findRecipeByIdForUser,
  findRecipesByUser,
  findRecipesPageByUser,
  insertRecipeWithinFreeLimit,
  type NewRecipePayload,
  setRecipeFavoriteForUser,
  updateRecipeForUser,
} from "./repository";

const dbMocks = vi.hoisted(() => {
  const db = {
    transaction: vi.fn(),
    select: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
  const tx = {
    execute: vi.fn(),
    insert: vi.fn(),
    select: vi.fn(),
  };

  return {
    and: vi.fn((...args: unknown[]) => ({ and: args })),
    count: vi.fn(() => "count"),
    db,
    desc: vi.fn((value: unknown) => ({ desc: value })),
    eq: vi.fn((left: unknown, right: unknown) => ({ left, right })),
    sql: Object.assign(
      vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
        strings: Array.from(strings),
        values,
      })),
      { join: (chunks: unknown[], separator: unknown) => ({ chunks, separator }) },
    ),
    tx,
  };
});

vi.mock("server-only", () => ({}));

vi.mock("@informach/db/schema", () => ({
  cozyaRecipes: {
    createdAt: "created_at",
    id: "id",
    isFavorite: "is_favorite",
    name: "name",
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
  creationMethod: "manual",
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

function selectListResult(
  rows: unknown[],
  capture?: { orderArgs?: unknown[]; limitArg?: number; offsetArg?: number },
) {
  return {
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        orderBy: vi.fn((...args: unknown[]) => {
          if (capture) capture.orderArgs = args;
          return {
            limit: vi.fn((limit: number) => {
              if (capture) capture.limitArg = limit;
              return {
                offset: vi.fn((offset: number) => {
                  if (capture) capture.offsetArg = offset;
                  return Promise.resolve(rows);
                }),
              };
            }),
          };
        }),
      })),
    })),
  };
}

function selectOneResult(rows: unknown[]) {
  return {
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn(() => Promise.resolve(rows)),
      })),
    })),
  };
}

function updateResult(rows: unknown[], capture?: { setArgs?: unknown }) {
  return {
    set: vi.fn((args: unknown) => {
      if (capture) capture.setArgs = args;
      return {
        where: vi.fn(() => ({
          returning: vi.fn(() => Promise.resolve(rows)),
        })),
      };
    }),
  };
}

function deleteResult(rows: unknown[]) {
  return {
    where: vi.fn(() => ({
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

describe("findRecipesByUser", () => {
  it("orders by isFavorite DESC and createdAt DESC", async () => {
    const capture: { orderArgs?: unknown[] } = {};
    dbMocks.db.select.mockReturnValue(selectListResult([recipe], capture));

    const result = await findRecipesByUser("user_123", 50);

    expect(result).toEqual([recipe]);
    expect(capture.orderArgs).toBeDefined();
    expect(capture.orderArgs?.length).toBe(2);
    expect(dbMocks.desc).toHaveBeenNthCalledWith(1, "is_favorite");
    expect(dbMocks.desc).toHaveBeenNthCalledWith(2, "created_at");
  });
});

describe("findRecipesPageByUser", () => {
  it("returns one page and reports when another page exists", async () => {
    const capture: { limitArg?: number; offsetArg?: number } = {};
    const extraRecipe = { ...recipe, id: "f598f499-7532-4902-9ba5-d1c8a5bce72a" };
    dbMocks.db.select.mockReturnValue(selectListResult([recipe, extraRecipe], capture));

    const result = await findRecipesPageByUser("user_123", { limit: 1, page: 2 });

    expect(result).toEqual({
      recipes: [recipe],
      page: 2,
      limit: 1,
      hasNextPage: true,
    });
    expect(capture.limitArg).toBe(2);
    expect(capture.offsetArg).toBe(1);
  });

  it("tokenizes the search input and AND-matches each word against the name", async () => {
    dbMocks.db.select.mockReturnValue(selectListResult([recipe]));
    dbMocks.sql.mockClear();

    await findRecipesPageByUser("user_123", { search: "Sopa de pipoca." });

    expect(dbMocks.sql).toHaveBeenCalledTimes(3);
    const patterns = dbMocks.sql.mock.calls.map((call) => call[2]);
    expect(patterns).toEqual(["%Sopa%", "%de%", "%pipoca%"]);
    for (const call of dbMocks.sql.mock.calls) {
      expect(call[1]).toBe("name");
      expect(call[3]).toBe("\\");
    }
  });

  it("uses the immutable unaccent wrapper for accent-insensitive indexed match", async () => {
    dbMocks.db.select.mockReturnValue(selectListResult([recipe]));
    dbMocks.sql.mockClear();

    await findRecipesPageByUser("user_123", { search: "açúcar" });

    expect(dbMocks.sql).toHaveBeenCalledTimes(1);
    const [strings] = dbMocks.sql.mock.calls[0] ?? [];
    expect(strings?.join("")).toContain("cozya.unaccent_immutable(");
    expect(strings?.join("")).toContain("ilike");
    expect(dbMocks.sql.mock.calls[0]?.[2]).toBe("%açúcar%");
  });

  it("strips wildcard chars from individual tokens before LIKE", async () => {
    dbMocks.db.select.mockReturnValue(selectListResult([recipe]));
    dbMocks.sql.mockClear();

    await findRecipesPageByUser("user_123", { search: "bolo_% teste" });

    const patterns = dbMocks.sql.mock.calls.map((call) => call[2]);
    expect(patterns).toEqual(["%bolo%", "%teste%"]);
  });

  it("falls back to userId-only filter when the search has no usable tokens", async () => {
    dbMocks.db.select.mockReturnValue(selectListResult([recipe]));
    dbMocks.sql.mockClear();

    await findRecipesPageByUser("user_123", { search: "  ...  " });

    expect(dbMocks.sql).not.toHaveBeenCalled();
  });
});

describe("findRecipeByIdForUser", () => {
  it("returns the recipe when row exists", async () => {
    dbMocks.db.select.mockReturnValue(selectOneResult([recipe]));

    const result = await findRecipeByIdForUser("user_123", recipe.id);

    expect(result).toEqual(recipe);
  });

  it("returns null when no row matches", async () => {
    dbMocks.db.select.mockReturnValue(selectOneResult([]));

    const result = await findRecipeByIdForUser("user_123", recipe.id);

    expect(result).toBeNull();
  });
});

describe("updateRecipeForUser", () => {
  it("returns the updated row and includes updatedAt in the set payload", async () => {
    const capture: { setArgs?: unknown } = {};
    dbMocks.db.update.mockReturnValue(updateResult([{ ...recipe, name: "Novo nome" }], capture));

    const result = await updateRecipeForUser("user_123", recipe.id, {
      name: "Novo nome",
      ingredients: "x",
      preparation: "y",
      finishing: null,
      isFavorite: true,
    });

    expect(result?.name).toBe("Novo nome");
    expect(capture.setArgs).toMatchObject({ name: "Novo nome", isFavorite: true });
    expect((capture.setArgs as { updatedAt: Date }).updatedAt).toBeInstanceOf(Date);
  });

  it("returns null when row does not belong to user", async () => {
    dbMocks.db.update.mockReturnValue(updateResult([]));

    const result = await updateRecipeForUser("other_user", recipe.id, {
      name: "x",
      ingredients: "y",
      preparation: "z",
      finishing: null,
      isFavorite: false,
    });

    expect(result).toBeNull();
  });
});

describe("deleteRecipeForUser", () => {
  it("returns true when a row is removed", async () => {
    dbMocks.db.delete.mockReturnValue(deleteResult([{ id: recipe.id }]));

    expect(await deleteRecipeForUser("user_123", recipe.id)).toBe(true);
  });

  it("returns false when nothing is removed", async () => {
    dbMocks.db.delete.mockReturnValue(deleteResult([]));

    expect(await deleteRecipeForUser("user_123", recipe.id)).toBe(false);
  });
});

describe("setRecipeFavoriteForUser", () => {
  it("returns the updated recipe with the new favorite flag", async () => {
    const capture: { setArgs?: unknown } = {};
    dbMocks.db.update.mockReturnValue(updateResult([{ ...recipe, isFavorite: true }], capture));

    const result = await setRecipeFavoriteForUser("user_123", recipe.id, true);

    expect(result?.isFavorite).toBe(true);
    expect(capture.setArgs).toMatchObject({ isFavorite: true });
  });

  it("returns null when no row matches", async () => {
    dbMocks.db.update.mockReturnValue(updateResult([]));

    const result = await setRecipeFavoriteForUser("user_123", recipe.id, false);

    expect(result).toBeNull();
  });
});
