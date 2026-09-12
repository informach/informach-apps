import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  deleteStudentProfileForUser,
  findStudentProfileByIdForUser,
  findStudentProfilesByUser,
  insertStudentProfileWithinLimit,
  type NewStudentProfilePayload,
  updateStudentProfileForUser,
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
    asc: vi.fn((value: unknown) => ({ asc: value })),
    count: vi.fn(() => "count"),
    db,
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
  agendaFamilyMembers: "family_members",
  agendaFamilyProfileAccess: "family_profile_access",
  agendaStudentProfiles: {
    createdAt: "created_at",
    id: "id",
    name: "name",
    birthDate: "birth_date",
    userId: "user_id",
  },
}));

vi.mock("@informach/db", () => ({
  or: (...args: unknown[]) => ({ or: args }),
  and: dbMocks.and,
  asc: dbMocks.asc,
  count: dbMocks.count,
  db: dbMocks.db,
  eq: dbMocks.eq,
  sql: dbMocks.sql,
}));

const payload: NewStudentProfilePayload = {
  userId: "user_123",
  name: "Helena",
  birthDate: "2017-03-15",
};

const profile = {
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

function selectListResult(rows: unknown[]) {
  return {
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        orderBy: vi.fn(() => Promise.resolve(rows)),
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

describe("insertStudentProfileWithinLimit", () => {
  it("serializes the count and insert inside one transaction", async () => {
    dbMocks.tx.select.mockReturnValue(selectCountResult(0));
    dbMocks.tx.insert.mockReturnValue(insertResult([profile]));

    const result = await insertStudentProfileWithinLimit(payload, 1);

    expect(result).toEqual({ ok: true, profile });
    expect(dbMocks.db.transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "read committed",
    });
    expect(dbMocks.tx.execute).toHaveBeenCalledTimes(1);
    expect(dbMocks.tx.insert).toHaveBeenCalledTimes(1);
    expect(dbMocks.sql.mock.calls[0]?.[1]).toBe("agenda:student_profiles:user_123");
  });

  it("does not insert when the Free limit (1) is reached", async () => {
    dbMocks.tx.select.mockReturnValue(selectCountResult(1));

    const result = await insertStudentProfileWithinLimit(payload, 1);

    expect(result).toEqual({ ok: false, current: 1 });
    expect(dbMocks.tx.execute).toHaveBeenCalledTimes(1);
    expect(dbMocks.tx.insert).not.toHaveBeenCalled();
  });

  it("does not insert when the Pro limit (3) is reached", async () => {
    dbMocks.tx.select.mockReturnValue(selectCountResult(3));

    const result = await insertStudentProfileWithinLimit(payload, 3);

    expect(result).toEqual({ ok: false, current: 3 });
    expect(dbMocks.tx.insert).not.toHaveBeenCalled();
  });

  it("inserts when below the Pro limit", async () => {
    dbMocks.tx.select.mockReturnValue(selectCountResult(2));
    dbMocks.tx.insert.mockReturnValue(insertResult([profile]));

    const result = await insertStudentProfileWithinLimit(payload, 3);

    expect(result).toEqual({ ok: true, profile });
  });
});

describe("findStudentProfilesByUser", () => {
  it("returns rows ordered by createdAt", async () => {
    dbMocks.db.select.mockReturnValue(selectListResult([profile]));

    const result = await findStudentProfilesByUser("user_123");

    expect(result).toEqual([profile]);
    expect(dbMocks.asc).toHaveBeenCalledWith("created_at");
  });
});

describe("findStudentProfileByIdForUser", () => {
  it("returns the profile when row exists", async () => {
    dbMocks.db.select.mockReturnValue(selectOneResult([profile]));

    const result = await findStudentProfileByIdForUser("user_123", profile.id);

    expect(result).toEqual(profile);
  });

  it("returns null when no row matches", async () => {
    dbMocks.db.select.mockReturnValue(selectOneResult([]));

    const result = await findStudentProfileByIdForUser("user_123", profile.id);

    expect(result).toBeNull();
  });
});

describe("updateStudentProfileForUser", () => {
  it("returns the updated row and includes updatedAt in the set payload", async () => {
    const capture: { setArgs?: unknown } = {};
    dbMocks.db.update.mockReturnValue(
      updateResult([{ ...profile, name: "Helena Maria" }], capture),
    );

    const result = await updateStudentProfileForUser("user_123", profile.id, {
      name: "Helena Maria",
      birthDate: "2017-03-15",
    });

    expect(result?.name).toBe("Helena Maria");
    expect(capture.setArgs).toMatchObject({ name: "Helena Maria" });
    expect((capture.setArgs as { updatedAt: Date }).updatedAt).toBeInstanceOf(Date);
  });

  it("returns null when row does not belong to user", async () => {
    dbMocks.db.update.mockReturnValue(updateResult([]));

    const result = await updateStudentProfileForUser("other_user", profile.id, {
      name: "x",
      birthDate: "2017-03-15",
    });

    expect(result).toBeNull();
  });
});

describe("deleteStudentProfileForUser", () => {
  it("returns true when a row is removed", async () => {
    dbMocks.db.delete.mockReturnValue(deleteResult([{ id: profile.id }]));

    expect(await deleteStudentProfileForUser("user_123", profile.id)).toBe(true);
  });

  it("returns false when nothing is removed", async () => {
    dbMocks.db.delete.mockReturnValue(deleteResult([]));

    expect(await deleteStudentProfileForUser("user_123", profile.id)).toBe(false);
  });
});
