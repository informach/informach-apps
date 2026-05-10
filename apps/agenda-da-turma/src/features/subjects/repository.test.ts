import { beforeEach, describe, expect, it, vi } from "vitest";
import { insertSubjectIfNotExists, updateSubjectById } from "./repository";

const dbMocks = vi.hoisted(() => {
  const db = {
    select: vi.fn(),
    selectDistinct: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
  return {
    and: vi.fn((...args: unknown[]) => ({ and: args })),
    asc: vi.fn((value: unknown) => ({ asc: value })),
    db,
    eq: vi.fn((left: unknown, right: unknown) => ({ left, right })),
    sql: vi.fn(() => ({ sql: true })),
  };
});

vi.mock("server-only", () => ({}));

vi.mock("@informach/db/schema", () => ({
  agendaSchools: { inepCode: "inep_code", cityIbgeCode: "city_ibge_code", name: "name" },
  agendaStudentProfiles: {
    id: "id",
    userId: "user_id",
    activeTurmaId: "active_turma_id",
  },
  agendaSubjects: {
    id: "id",
    turmaId: "turma_id",
    name: "name",
    teacherName: "teacher_name",
    createdByUserId: "created_by_user_id",
    createdAt: "created_at",
    updatedAt: "updated_at",
  },
  agendaTurmas: {
    id: "id",
    schoolInepCode: "school_inep_code",
    grade: "grade",
    classLetter: "class_letter",
    year: "year",
    createdByUserId: "created_by_user_id",
  },
}));

vi.mock("@informach/db", () => ({
  and: dbMocks.and,
  asc: dbMocks.asc,
  db: dbMocks.db,
  eq: dbMocks.eq,
  sql: dbMocks.sql,
}));

const insertedSubject = {
  id: "subj_1",
  turmaId: "turma_1",
  name: "Matemática",
  teacherName: "Carla",
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

function updateChain(returningRows: unknown[]) {
  return {
    set: vi.fn(() => ({
      where: vi.fn(() => ({
        returning: vi.fn(() => Promise.resolve(returningRows)),
      })),
    })),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("insertSubjectIfNotExists", () => {
  it("returns created=true when the row was inserted", async () => {
    dbMocks.db.insert.mockReturnValue(insertChain([insertedSubject]));

    const result = await insertSubjectIfNotExists({
      turmaId: insertedSubject.turmaId,
      name: insertedSubject.name,
      teacherName: insertedSubject.teacherName,
      createdByUserId: insertedSubject.createdByUserId,
    });

    expect(result.created).toBe(true);
    expect(result.subject.id).toBe(insertedSubject.id);
  });

  it("returns created=false and the existing row on conflict", async () => {
    dbMocks.db.insert.mockReturnValue(insertChain([]));
    dbMocks.db.select.mockReturnValue(selectExisting([insertedSubject]));

    const result = await insertSubjectIfNotExists({
      turmaId: insertedSubject.turmaId,
      name: insertedSubject.name,
      teacherName: null,
      createdByUserId: "another_user",
    });

    expect(result.created).toBe(false);
    expect(result.subject.id).toBe(insertedSubject.id);
  });

  it("throws when insert returns empty AND no existing row is found", async () => {
    dbMocks.db.insert.mockReturnValue(insertChain([]));
    dbMocks.db.select.mockReturnValue(selectExisting([]));

    await expect(
      insertSubjectIfNotExists({
        turmaId: "turma_x",
        name: "Foo",
        teacherName: null,
        createdByUserId: "user_x",
      }),
    ).rejects.toThrow(/check unique key/);
  });
});

describe("updateSubjectById", () => {
  it("returns the updated row", async () => {
    const updated = { ...insertedSubject, name: "Matemática II" };
    dbMocks.db.update.mockReturnValue(updateChain([updated]));

    const result = await updateSubjectById(insertedSubject.id, {
      name: "Matemática II",
      teacherName: insertedSubject.teacherName,
    });

    expect(result?.name).toBe("Matemática II");
  });

  it("returns null when no row is updated", async () => {
    dbMocks.db.update.mockReturnValue(updateChain([]));

    const result = await updateSubjectById("missing", {
      name: "X",
      teacherName: null,
    });

    expect(result).toBeNull();
  });
});
