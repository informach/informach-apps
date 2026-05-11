import { beforeEach, describe, expect, it, vi } from "vitest";
import { deleteTurma } from "./service";

const mocks = vi.hoisted(() => ({
  findStudentProfileByIdForUser: vi.fn(),
  findTurmaByCode: vi.fn(),
  findTurmaWithSchoolById: vi.fn(),
  hasOtherFamilyMembersInTurma: vi.fn(),
  deleteTurmaById: vi.fn(),
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
  verifyMembership: vi.fn(),
}));

const creator = { id: "user_creator" };
const otherUser = { id: "user_other" };
const turmaId = "turma_1";

const turmaFromCreator = {
  id: turmaId,
  createdByUserId: creator.id,
  // demais campos não importam pros testes de deleteTurma
} as never;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("deleteTurma", () => {
  it("apaga com sucesso quando criador é o único membro da turma", async () => {
    mocks.findTurmaWithSchoolById.mockResolvedValue(turmaFromCreator);
    mocks.hasOtherFamilyMembersInTurma.mockResolvedValue(false);
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
    expect(mocks.deleteTurmaById).not.toHaveBeenCalled();
  });
});
