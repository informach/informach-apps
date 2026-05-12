import { beforeEach, describe, expect, it, vi } from "vitest";
import { deleteTurma, updateTurma } from "./service";

const mocks = vi.hoisted(() => ({
  findStudentProfileByIdForUser: vi.fn(),
  findTurmaByCode: vi.fn(),
  findTurmaWithSchoolById: vi.fn(),
  hasOtherFamilyMembersInTurma: vi.fn(),
  turmaHasActivities: vi.fn(),
  deleteTurmaById: vi.fn(),
  updateTurma: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@informach/auth/server-actions", () => ({
  ok: <T>(value: T) => ({ ok: true as const, value }),
  err: <E>(error: E) => ({ ok: false as const, error }),
}));

vi.mock("@/features/students/repository", () => ({
  findStudentProfileByIdForUser: mocks.findStudentProfileByIdForUser,
}));

vi.mock("./repository", () => ({
  deleteTurmaById: mocks.deleteTurmaById,
  deleteTurmaMember: vi.fn(),
  findTurmaByCode: mocks.findTurmaByCode,
  findTurmaWithSchoolById: mocks.findTurmaWithSchoolById,
  generateUniqueTurmaCode: vi.fn(),
  hasOtherFamilyMembersInTurma: mocks.hasOtherFamilyMembersInTurma,
  insertTurmaIfNotExists: vi.fn(),
  insertTurmaMember: vi.fn(),
  listTurmasForUser: vi.fn(),
  setActiveTurma: vi.fn(),
  turmaHasActivities: mocks.turmaHasActivities,
  updateTurma: mocks.updateTurma,
  verifyMembership: vi.fn(),
}));

const creator = { id: "user_creator" };
const otherUser = { id: "user_other" };
const turmaId = "turma_1";

const turmaFromCreator = {
  id: turmaId,
  createdByUserId: creator.id,
  schoolInepCode: "inep_1",
  grade: "5ano",
  year: 2026,
  classLetter: "A",
  schoolName: "Escola X",
  cityName: "BH",
  stateUf: "MG",
  // demais campos não importam pros testes
} as never;

const updateInput = {
  turmaId,
  grade: "6ano",
  year: 2026,
  classLetter: "B",
} as const;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("deleteTurma", () => {
  it("apaga com sucesso quando criador é o único membro da turma e não há atividades", async () => {
    mocks.findTurmaWithSchoolById.mockResolvedValue(turmaFromCreator);
    mocks.hasOtherFamilyMembersInTurma.mockResolvedValue(false);
    mocks.turmaHasActivities.mockResolvedValue(false);
    mocks.deleteTurmaById.mockResolvedValue(true);

    const result = await deleteTurma(creator.id, { turmaId });

    expect(result.ok).toBe(true);
    expect(mocks.deleteTurmaById).toHaveBeenCalledWith(turmaId);
  });

  it("rejeita TURMA_NOT_FOUND quando turma não existe", async () => {
    mocks.findTurmaWithSchoolById.mockResolvedValue(null);

    const result = await deleteTurma(creator.id, { turmaId });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("TURMA_NOT_FOUND");
    expect(mocks.deleteTurmaById).not.toHaveBeenCalled();
  });

  it("rejeita FORBIDDEN quando não-creator tenta apagar", async () => {
    mocks.findTurmaWithSchoolById.mockResolvedValue(turmaFromCreator);

    const result = await deleteTurma(otherUser.id, { turmaId });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
    expect(mocks.hasOtherFamilyMembersInTurma).not.toHaveBeenCalled();
    expect(mocks.deleteTurmaById).not.toHaveBeenCalled();
  });

  it("rejeita HAS_OTHER_MEMBERS quando outra família tem perfil vinculado", async () => {
    mocks.findTurmaWithSchoolById.mockResolvedValue(turmaFromCreator);
    mocks.hasOtherFamilyMembersInTurma.mockResolvedValue(true);

    const result = await deleteTurma(creator.id, { turmaId });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("HAS_OTHER_MEMBERS");
    expect(mocks.turmaHasActivities).not.toHaveBeenCalled();
    expect(mocks.deleteTurmaById).not.toHaveBeenCalled();
  });

  it("rejeita HAS_ACTIVITIES quando a turma tem qualquer atividade", async () => {
    mocks.findTurmaWithSchoolById.mockResolvedValue(turmaFromCreator);
    mocks.hasOtherFamilyMembersInTurma.mockResolvedValue(false);
    mocks.turmaHasActivities.mockResolvedValue(true);

    const result = await deleteTurma(creator.id, { turmaId });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("HAS_ACTIVITIES");
    expect(mocks.deleteTurmaById).not.toHaveBeenCalled();
  });
});

describe("updateTurma", () => {
  it("atualiza com sucesso quando turma é fresca", async () => {
    const turmaAfterUpdate = {
      id: turmaId,
      createdByUserId: creator.id,
      schoolInepCode: "inep_1",
      grade: updateInput.grade,
      year: updateInput.year,
      classLetter: updateInput.classLetter,
      schoolName: "Escola X",
      cityName: "BH",
      stateUf: "MG",
    } as never;
    mocks.findTurmaWithSchoolById
      .mockResolvedValueOnce(turmaFromCreator)
      .mockResolvedValueOnce(turmaAfterUpdate);
    mocks.hasOtherFamilyMembersInTurma.mockResolvedValue(false);
    mocks.turmaHasActivities.mockResolvedValue(false);
    mocks.updateTurma.mockResolvedValue({ ok: true, turma: { id: turmaId } });

    const result = await updateTurma(creator.id, updateInput);

    expect(result.ok).toBe(true);
    expect(mocks.updateTurma).toHaveBeenCalledWith(turmaId, {
      grade: "6ano",
      year: 2026,
      classLetter: "B",
    });
  });

  it("rejeita FORBIDDEN quando não-creator tenta editar", async () => {
    mocks.findTurmaWithSchoolById.mockResolvedValue(turmaFromCreator);

    const result = await updateTurma(otherUser.id, updateInput);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
    expect(mocks.updateTurma).not.toHaveBeenCalled();
  });

  it("rejeita HAS_OTHER_MEMBERS quando outra família está vinculada", async () => {
    mocks.findTurmaWithSchoolById.mockResolvedValue(turmaFromCreator);
    mocks.hasOtherFamilyMembersInTurma.mockResolvedValue(true);

    const result = await updateTurma(creator.id, updateInput);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("HAS_OTHER_MEMBERS");
    expect(mocks.updateTurma).not.toHaveBeenCalled();
  });

  it("rejeita HAS_ACTIVITIES quando a turma tem qualquer atividade", async () => {
    mocks.findTurmaWithSchoolById.mockResolvedValue(turmaFromCreator);
    mocks.hasOtherFamilyMembersInTurma.mockResolvedValue(false);
    mocks.turmaHasActivities.mockResolvedValue(true);

    const result = await updateTurma(creator.id, updateInput);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("HAS_ACTIVITIES");
    expect(mocks.updateTurma).not.toHaveBeenCalled();
  });

  it("rejeita CONFLICT_EXISTING_TURMA quando o UPDATE colide com outra turma", async () => {
    mocks.findTurmaWithSchoolById.mockResolvedValue(turmaFromCreator);
    mocks.hasOtherFamilyMembersInTurma.mockResolvedValue(false);
    mocks.turmaHasActivities.mockResolvedValue(false);
    mocks.updateTurma.mockResolvedValue({ ok: false, code: "CONFLICT_EXISTING_TURMA" });

    const result = await updateTurma(creator.id, updateInput);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONFLICT_EXISTING_TURMA");
  });
});
