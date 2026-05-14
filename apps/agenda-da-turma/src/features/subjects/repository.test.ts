import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  insertSubjectIfNotExists,
  subjectNameExistsInTurmaExceptId,
  updateSubjectById,
} from "./repository";

const dbMocks = vi.hoisted(() => {
  const db = {
    select: vi.fn(),
    selectDistinct: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    execute: vi.fn(() => Promise.resolve()),
    transaction: vi.fn(async (cb: (tx: unknown) => unknown, _opts?: unknown) => await cb(db)),
  };
  return {
    and: vi.fn((...args: unknown[]) => ({ and: args })),
    asc: vi.fn((value: unknown) => ({ asc: value })),
    db,
    eq: vi.fn((left: unknown, right: unknown) => ({ left, right })),
    ne: vi.fn((left: unknown, right: unknown) => ({ left, not: right })),
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
    colorIndex: "color_index",
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
  ne: dbMocks.ne,
  sql: dbMocks.sql,
}));

const insertedSubject = {
  id: "subj_1",
  turmaId: "turma_1",
  name: "Matemática",
  teacherName: "Carla",
  colorIndex: 1,
  createdByUserId: "user_1",
  createdAt: new Date(),
  updatedAt: new Date(),
};

// Captura os values passados pro insert pra que os testes possam asserir
// que colorIndex foi calculado e incluído.
let capturedInsertValues: Record<string, unknown> | null = null;

function insertChain(returningRows: unknown[]) {
  return {
    values: vi.fn((values: Record<string, unknown>) => {
      capturedInsertValues = values;
      return {
        onConflictDoNothing: vi.fn(() => ({
          returning: vi.fn(() => Promise.resolve(returningRows)),
        })),
      };
    }),
  };
}

// Captura os values do `.set({...})` no UPDATE de merge de teacherName.
let capturedUpdateSetValues: Record<string, unknown> | null = null;

function mergeUpdateChain(returningRows: unknown[]) {
  return {
    set: vi.fn((values: Record<string, unknown>) => {
      capturedUpdateSetValues = values;
      return {
        where: vi.fn(() => ({
          returning: vi.fn(() => Promise.resolve(returningRows)),
        })),
      };
    }),
  };
}

// Cadeia pra `select({ colorIndex }).from(...).where(...)` — `.where()` é
// thenable e resolve com a lista de rows.
function selectColorIndexesChain(colorIndexes: number[]) {
  return {
    from: vi.fn(() => ({
      where: vi.fn(() => Promise.resolve(colorIndexes.map((idx) => ({ colorIndex: idx })))),
    })),
  };
}

// Cadeia pra `select().from(...).where(...).limit(1)` — resolve no `.limit()`.
function selectExistingChain(rows: unknown[]) {
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
  capturedInsertValues = null;
  capturedUpdateSetValues = null;
});

describe("insertSubjectIfNotExists", () => {
  it("returns status=created and assigns curated colorIndex=1 for Matemática (turma vazia)", async () => {
    dbMocks.db.select.mockReturnValueOnce(selectColorIndexesChain([]));
    dbMocks.db.insert.mockReturnValue(insertChain([insertedSubject]));

    const result = await insertSubjectIfNotExists({
      turmaId: insertedSubject.turmaId,
      name: insertedSubject.name,
      teacherName: insertedSubject.teacherName,
      createdByUserId: insertedSubject.createdByUserId,
    });

    expect(result.status).toBe("created");
    expect(result.subject.id).toBe(insertedSubject.id);
    expect(capturedInsertValues?.colorIndex).toBe(1);
  });

  it("avoids color collision: Redação após Matemática vai pra slot 2", async () => {
    dbMocks.db.select.mockReturnValueOnce(selectColorIndexesChain([1]));
    dbMocks.db.insert.mockReturnValue(insertChain([{ ...insertedSubject, id: "subj_2" }]));

    const result = await insertSubjectIfNotExists({
      turmaId: insertedSubject.turmaId,
      name: "Redação",
      teacherName: null,
      createdByUserId: insertedSubject.createdByUserId,
    });

    expect(result.status).toBe("created");
    expect(capturedInsertValues?.colorIndex).toBe(2);
  });

  it("returns status=skipped on conflict when other user created the existing row (governança)", async () => {
    dbMocks.db.select
      .mockReturnValueOnce(selectColorIndexesChain([]))
      .mockReturnValueOnce(selectExistingChain([{ ...insertedSubject, teacherName: null }]));
    dbMocks.db.insert.mockReturnValue(insertChain([]));

    const result = await insertSubjectIfNotExists({
      turmaId: insertedSubject.turmaId,
      name: insertedSubject.name,
      teacherName: "Roberto",
      createdByUserId: "another_user",
    });

    expect(result.status).toBe("skipped");
    expect(result.subject.id).toBe(insertedSubject.id);
    expect(capturedUpdateSetValues).toBeNull();
  });

  it("returns status=skipped on conflict when existing row already has teacherName (não sobrescreve)", async () => {
    dbMocks.db.select
      .mockReturnValueOnce(selectColorIndexesChain([]))
      .mockReturnValueOnce(selectExistingChain([{ ...insertedSubject, teacherName: "Carla" }]));
    dbMocks.db.insert.mockReturnValue(insertChain([]));

    const result = await insertSubjectIfNotExists({
      turmaId: insertedSubject.turmaId,
      name: insertedSubject.name,
      teacherName: "Roberto",
      createdByUserId: insertedSubject.createdByUserId,
    });

    expect(result.status).toBe("skipped");
    expect(capturedUpdateSetValues).toBeNull();
  });

  it("returns status=skipped on conflict when payload tem teacherName=null (nada a fundir)", async () => {
    dbMocks.db.select
      .mockReturnValueOnce(selectColorIndexesChain([]))
      .mockReturnValueOnce(selectExistingChain([{ ...insertedSubject, teacherName: null }]));
    dbMocks.db.insert.mockReturnValue(insertChain([]));

    const result = await insertSubjectIfNotExists({
      turmaId: insertedSubject.turmaId,
      name: insertedSubject.name,
      teacherName: null,
      createdByUserId: insertedSubject.createdByUserId,
    });

    expect(result.status).toBe("skipped");
    expect(capturedUpdateSetValues).toBeNull();
  });

  it("returns status=merged when existing row do mesmo creator está sem teacher e payload tem teacher", async () => {
    const existingNoTeacher = { ...insertedSubject, teacherName: null };
    const merged = { ...insertedSubject, teacherName: "Roberto" };
    dbMocks.db.select
      .mockReturnValueOnce(selectColorIndexesChain([]))
      .mockReturnValueOnce(selectExistingChain([existingNoTeacher]));
    dbMocks.db.insert.mockReturnValue(insertChain([]));
    dbMocks.db.update.mockReturnValue(mergeUpdateChain([merged]));

    const result = await insertSubjectIfNotExists({
      turmaId: insertedSubject.turmaId,
      name: insertedSubject.name,
      teacherName: "Roberto",
      createdByUserId: insertedSubject.createdByUserId,
    });

    expect(result.status).toBe("merged");
    expect(result.subject.teacherName).toBe("Roberto");
    expect(capturedUpdateSetValues?.teacherName).toBe("Roberto");
  });

  it("throws when insert returns empty AND no existing row is found", async () => {
    dbMocks.db.select
      .mockReturnValueOnce(selectColorIndexesChain([]))
      .mockReturnValueOnce(selectExistingChain([]));
    dbMocks.db.insert.mockReturnValue(insertChain([]));

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

describe("subjectNameExistsInTurmaExceptId", () => {
  it("returns true when another subject has the same name in the turma", async () => {
    dbMocks.db.select.mockReturnValue(selectExistingChain([{ id: "subj_2" }]));

    const result = await subjectNameExistsInTurmaExceptId("turma_1", "Português", "subj_1");

    expect(result).toBe(true);
  });

  it("returns false when no other subject has the same name in the turma", async () => {
    dbMocks.db.select.mockReturnValue(selectExistingChain([]));

    const result = await subjectNameExistsInTurmaExceptId("turma_1", "Português", "subj_1");

    expect(result).toBe(false);
  });
});
