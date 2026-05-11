import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSubject, deleteSubject, updateSubject } from "./service";

const mocks = vi.hoisted(() => ({
  // turmas/repository
  findTurmaWithSchoolById: vi.fn(),
  userHasMemberInTurma: vi.fn(),
  // subjects/repository
  insertSubjectIfNotExists: vi.fn(),
  findSubjectById: vi.fn(),
  updateSubjectById: vi.fn(),
  deleteSubjectById: vi.fn(),
  listSubjectsForTurma: vi.fn(),
  findTurmasOfUserMissingSubjects: vi.fn(),
  isSubjectInUseByOtherUsers: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@informach/auth/server-actions", () => ({
  ok: <T>(value: T) => ({ ok: true as const, value }),
  err: <E>(error: E) => ({ ok: false as const, error }),
}));

vi.mock("@/features/turmas/repository", () => ({
  findTurmaWithSchoolById: mocks.findTurmaWithSchoolById,
  userHasMemberInTurma: mocks.userHasMemberInTurma,
}));

vi.mock("./repository", () => ({
  insertSubjectIfNotExists: mocks.insertSubjectIfNotExists,
  findSubjectById: mocks.findSubjectById,
  updateSubjectById: mocks.updateSubjectById,
  deleteSubjectById: mocks.deleteSubjectById,
  listSubjectsForTurma: mocks.listSubjectsForTurma,
  findTurmasOfUserMissingSubjects: mocks.findTurmasOfUserMissingSubjects,
  isSubjectInUseByOtherUsers: mocks.isSubjectInUseByOtherUsers,
}));

const creator = { id: "user_creator" };
const member = { id: "user_member" };
const otherUser = { id: "user_other" };
const turmaId = "turma_1";
const subjectId = "subj_1";

const turmaFromCreator = {
  id: turmaId,
  createdByUserId: creator.id,
  // outros campos do TurmaWithSchool não importam para os testes
} as never;

const subjectByMember = {
  id: subjectId,
  turmaId,
  name: "Matemática",
  teacherName: null,
  colorIndex: 1,
  createdByUserId: member.id,
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
  // Defaults: matéria não está em uso por outras famílias.
  mocks.isSubjectInUseByOtherUsers.mockResolvedValue(false);
});

describe("createSubject", () => {
  it("aceita quando o user é creator da turma", async () => {
    mocks.findTurmaWithSchoolById.mockResolvedValue(turmaFromCreator);
    mocks.userHasMemberInTurma.mockResolvedValue(false); // creator nem precisa
    mocks.insertSubjectIfNotExists.mockResolvedValue({
      created: true,
      subject: subjectByMember,
    });

    const result = await createSubject(creator.id, {
      turmaId,
      name: "Matemática",
      teacherName: undefined,
    });

    expect(result.ok).toBe(true);
    expect(mocks.insertSubjectIfNotExists).toHaveBeenCalled();
    // Creator não precisa passar pela query de membership (short-circuit).
    expect(mocks.userHasMemberInTurma).not.toHaveBeenCalled();
  });

  it("aceita quando o user é membro não-creator", async () => {
    mocks.findTurmaWithSchoolById.mockResolvedValue(turmaFromCreator);
    mocks.userHasMemberInTurma.mockResolvedValue(true);
    mocks.insertSubjectIfNotExists.mockResolvedValue({
      created: true,
      subject: { ...subjectByMember, createdByUserId: member.id },
    });

    const result = await createSubject(member.id, {
      turmaId,
      name: "Educação Física",
      teacherName: undefined,
    });

    expect(result.ok).toBe(true);
    expect(mocks.userHasMemberInTurma).toHaveBeenCalledWith(member.id, turmaId);
  });

  it("rejeita NOT_A_MEMBER quando nem creator nem membro", async () => {
    mocks.findTurmaWithSchoolById.mockResolvedValue(turmaFromCreator);
    mocks.userHasMemberInTurma.mockResolvedValue(false);

    const result = await createSubject(otherUser.id, {
      turmaId,
      name: "Música",
      teacherName: undefined,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_A_MEMBER");
    expect(mocks.insertSubjectIfNotExists).not.toHaveBeenCalled();
  });

  it("rejeita TURMA_NOT_FOUND quando turma não existe", async () => {
    mocks.findTurmaWithSchoolById.mockResolvedValue(null);

    const result = await createSubject(member.id, {
      turmaId,
      name: "X",
      teacherName: undefined,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("TURMA_NOT_FOUND");
  });

  it("rejeita DUPLICATE quando insertSubjectIfNotExists devolve created=false", async () => {
    mocks.findTurmaWithSchoolById.mockResolvedValue(turmaFromCreator);
    mocks.userHasMemberInTurma.mockResolvedValue(true);
    mocks.insertSubjectIfNotExists.mockResolvedValue({
      created: false,
      subject: subjectByMember,
    });

    const result = await createSubject(member.id, {
      turmaId,
      name: "Matemática",
      teacherName: undefined,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("DUPLICATE");
  });
});

describe("updateSubject", () => {
  it("aceita troca livre do nome quando ninguém mais usa a matéria", async () => {
    mocks.findSubjectById.mockResolvedValue(subjectByMember);
    mocks.isSubjectInUseByOtherUsers.mockResolvedValue(false);
    mocks.updateSubjectById.mockResolvedValue({ ...subjectByMember, name: "Educação Física" });

    // Mudança radical de nome — só não pode quando outras famílias usam.
    const result = await updateSubject(member.id, {
      id: subjectId,
      name: "Educação Física",
      teacherName: undefined,
    });

    expect(result.ok).toBe(true);
    expect(mocks.isSubjectInUseByOtherUsers).toHaveBeenCalledWith(subjectId, member.id);
  });

  it("aceita ajuste pequeno do nome (acento) mesmo quando outras famílias usam", async () => {
    mocks.findSubjectById.mockResolvedValue({ ...subjectByMember, name: "Matematica" });
    mocks.isSubjectInUseByOtherUsers.mockResolvedValue(true);
    mocks.updateSubjectById.mockResolvedValue({ ...subjectByMember, name: "Matemática" });

    const result = await updateSubject(member.id, {
      id: subjectId,
      name: "Matemática", // só acento — normalize-equal
      teacherName: undefined,
    });

    expect(result.ok).toBe(true);
  });

  it("aceita correção de erro de digitação (Levenshtein ≤ 3) quando em uso", async () => {
    mocks.findSubjectById.mockResolvedValue({ ...subjectByMember, name: "Matemtica" });
    mocks.isSubjectInUseByOtherUsers.mockResolvedValue(true);
    mocks.updateSubjectById.mockResolvedValue({ ...subjectByMember, name: "Matemática" });

    const result = await updateSubject(member.id, {
      id: subjectId,
      name: "Matemática", // typo fix
      teacherName: undefined,
    });

    expect(result.ok).toBe(true);
  });

  it("rejeita NAME_CHANGE_TOO_BIG quando mudança grande + em uso por outras famílias", async () => {
    mocks.findSubjectById.mockResolvedValue(subjectByMember); // name: "Matemática"
    mocks.isSubjectInUseByOtherUsers.mockResolvedValue(true);

    const result = await updateSubject(member.id, {
      id: subjectId,
      name: "Educação Física",
      teacherName: undefined,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NAME_CHANGE_TOO_BIG");
    expect(mocks.updateSubjectById).not.toHaveBeenCalled();
  });

  it("aceita edit só do professor sem verificar in-use", async () => {
    mocks.findSubjectById.mockResolvedValue(subjectByMember);
    mocks.updateSubjectById.mockResolvedValue({ ...subjectByMember, teacherName: "Carla" });

    const result = await updateSubject(member.id, {
      id: subjectId,
      name: subjectByMember.name, // nome inalterado
      teacherName: "Carla",
    });

    expect(result.ok).toBe(true);
    // Não precisa consultar uso quando o nome não muda.
    expect(mocks.isSubjectInUseByOtherUsers).not.toHaveBeenCalled();
  });

  it("rejeita FORBIDDEN quando não-criador tenta editar", async () => {
    mocks.findSubjectById.mockResolvedValue(subjectByMember);

    const result = await updateSubject(creator.id, {
      id: subjectId,
      name: "X",
      teacherName: undefined,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
    expect(mocks.updateSubjectById).not.toHaveBeenCalled();
  });

  it("rejeita NOT_FOUND quando matéria não existe", async () => {
    mocks.findSubjectById.mockResolvedValue(null);

    const result = await updateSubject(member.id, {
      id: subjectId,
      name: "Z",
      teacherName: undefined,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_FOUND");
  });
});

describe("deleteSubject", () => {
  it("aceita quando o user é o criador da matéria", async () => {
    mocks.findSubjectById.mockResolvedValue(subjectByMember);
    mocks.deleteSubjectById.mockResolvedValue(true);

    const result = await deleteSubject(member.id, { id: subjectId });

    expect(result.ok).toBe(true);
    expect(mocks.deleteSubjectById).toHaveBeenCalledWith(subjectId);
  });

  it("rejeita FORBIDDEN quando não-criador tenta excluir", async () => {
    mocks.findSubjectById.mockResolvedValue(subjectByMember);

    const result = await deleteSubject(creator.id, { id: subjectId });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
    expect(mocks.deleteSubjectById).not.toHaveBeenCalled();
  });

  it("rejeita IN_USE_BY_OTHERS quando a matéria está em uso", async () => {
    mocks.findSubjectById.mockResolvedValue(subjectByMember);
    mocks.isSubjectInUseByOtherUsers.mockResolvedValue(true);

    const result = await deleteSubject(member.id, { id: subjectId });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("IN_USE_BY_OTHERS");
    expect(mocks.deleteSubjectById).not.toHaveBeenCalled();
  });
});
