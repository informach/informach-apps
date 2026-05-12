import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateUniqueTurmaCode, insertTurmaIfNotExists } from "./repository";

const dbMocks = vi.hoisted(() => {
  const db = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn(),
  };
  return {
    and: vi.fn((...args: unknown[]) => ({ and: args })),
    asc: vi.fn((value: unknown) => ({ asc: value })),
    count: vi.fn(() => "count"),
    db,
    eq: vi.fn((left: unknown, right: unknown) => ({ left, right })),
    inArray: vi.fn((col: unknown, values: unknown[]) => ({ in: { col, values } })),
    sql: vi.fn(() => ({ sql: true })),
  };
});

vi.mock("server-only", () => ({}));

vi.mock("@informach/db/schema", () => ({
  agendaCities: { ibgeCode: "ibge_code", stateUf: "state_uf", name: "name" },
  agendaSchools: { inepCode: "inep_code", cityIbgeCode: "city_ibge_code", name: "name" },
  agendaStates: { uf: "uf", ibgeCode: "ibge_code", name: "name" },
  agendaStudentProfiles: {
    id: "id",
    name: "name",
    userId: "user_id",
    activeTurmaId: "active_turma_id",
  },
  agendaTurmaMembers: {
    id: "id",
    turmaId: "turma_id",
    studentProfileId: "student_profile_id",
  },
  agendaTurmas: {
    id: "id",
    code: "code",
    schoolInepCode: "school_inep_code",
    grade: "grade",
    year: "year",
    classLetter: "class_letter",
    createdByUserId: "created_by_user_id",
    createdAt: "created_at",
    updatedAt: "updated_at",
  },
}));

vi.mock("@informach/db", () => ({
  and: dbMocks.and,
  asc: dbMocks.asc,
  count: dbMocks.count,
  db: dbMocks.db,
  eq: dbMocks.eq,
  inArray: dbMocks.inArray,
  sql: dbMocks.sql,
}));

const insertedTurma = {
  id: "abc",
  code: "B7K3PX",
  schoolInepCode: "DEVSCH0001",
  grade: "5ano" as const,
  year: 2026,
  classLetter: "A",
  createdByUserId: "user_1",
  createdAt: new Date(),
  updatedAt: new Date(),
};

function insertChain(returningRows: unknown[]) {
  return {
    values: vi.fn(() => ({
      onConflictDoNothing: vi.fn(() => ({
        returning: vi.fn(() => Promise.resolve(returningRows)),
      })),
    })),
  };
}

function selectExisting(rows: unknown[]) {
  return {
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn(() => Promise.resolve(rows)),
      })),
    })),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("insertTurmaIfNotExists", () => {
  it("returns created=true when the row was inserted", async () => {
    dbMocks.db.insert.mockReturnValue(insertChain([insertedTurma]));

    const result = await insertTurmaIfNotExists({
      code: insertedTurma.code,
      schoolInepCode: insertedTurma.schoolInepCode,
      grade: insertedTurma.grade,
      year: insertedTurma.year,
      classLetter: insertedTurma.classLetter,
      createdByUserId: insertedTurma.createdByUserId,
    });

    expect(result).toMatchObject({ created: true, turma: { id: insertedTurma.id } });
  });

  it("returns created=false and the existing row when conflict happens", async () => {
    dbMocks.db.insert.mockReturnValue(insertChain([]));
    dbMocks.db.select.mockReturnValue(selectExisting([insertedTurma]));

    const result = await insertTurmaIfNotExists({
      code: "NEWCODE",
      schoolInepCode: insertedTurma.schoolInepCode,
      grade: insertedTurma.grade,
      year: insertedTurma.year,
      classLetter: insertedTurma.classLetter,
      createdByUserId: insertedTurma.createdByUserId,
    });

    expect(result).toMatchObject({ created: false, turma: { id: insertedTurma.id } });
  });

  it("returns codeConflict when a non-natural-key unique conflict happens", async () => {
    dbMocks.db.insert.mockReturnValue(insertChain([]));
    dbMocks.db.select.mockReturnValue(selectExisting([]));

    const result = await insertTurmaIfNotExists({
      code: "NEWCODE",
      schoolInepCode: insertedTurma.schoolInepCode,
      grade: insertedTurma.grade,
      year: insertedTurma.year,
      classLetter: insertedTurma.classLetter,
      createdByUserId: insertedTurma.createdByUserId,
    });

    expect(result).toEqual({ codeConflict: true });
  });
});

describe("generateUniqueTurmaCode", () => {
  it("returns a code when none collides", async () => {
    dbMocks.db.select.mockReturnValue(selectExisting([]));
    const code = await generateUniqueTurmaCode(3);
    expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
  });

  it("retries on collisions and eventually throws when exhausted", async () => {
    dbMocks.db.select.mockReturnValue(selectExisting([insertedTurma]));
    await expect(generateUniqueTurmaCode(2)).rejects.toThrow(/Failed to generate unique/);
  });
});
