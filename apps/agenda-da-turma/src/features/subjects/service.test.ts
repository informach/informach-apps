import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSubject, createSubjectsBatch, deleteSubject, updateSubject } from "./service";

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
  subjectNameExistsInTurmaExceptId: vi.fn(),
  attachAlternatingSlotsOne: vi.fn(),
  attachAlternatingSlots: vi.fn(),
  // alternating-slots-repository
  syncAlternatingSlotsForSubject: vi.fn(),
  pairedSubjectBelongsToSameTurma: vi.fn(),
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
  subjectNameExistsInTurmaExceptId: mocks.subjectNameExistsInTurmaExceptId,
  attachAlternatingSlotsOne: mocks.attachAlternatingSlotsOne,
  attachAlternatingSlots: mocks.attachAlternatingSlots,
}));

vi.mock("./alternating-slots-repository", () => ({
  syncAlternatingSlotsForSubject: mocks.syncAlternatingSlotsForSubject,
  pairedSubjectBelongsToSameTurma: mocks.pairedSubjectBelongsToSameTurma,
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
  classDays: [] as string[],
  colorIndex: 1,
  createdByUserId: member.id,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const noFilled = { teacherName: false, classDays: false };

beforeEach(() => {
  vi.clearAllMocks();
  // Defaults: matéria não está em uso por outras famílias.
  mocks.isSubjectInUseByOtherUsers.mockResolvedValue(false);
  mocks.subjectNameExistsInTurmaExceptId.mockResolvedValue(false);
  // Default: attach helpers retornam o subject com alternatingSlots=[] (sem
  // slots). Testes específicos podem sobrescrever.
  mocks.attachAlternatingSlotsOne.mockImplementation(async (row: unknown) =>
    row ? { ...(row as object), alternatingSlots: [] } : null,
  );
  mocks.attachAlternatingSlots.mockImplementation(async (rows: unknown[]) =>
    rows.map((r) => ({ ...(r as object), alternatingSlots: [] })),
  );
  mocks.syncAlternatingSlotsForSubject.mockResolvedValue(undefined);
  mocks.pairedSubjectBelongsToSameTurma.mockResolvedValue(true);
});

describe("createSubject", () => {
  it("aceita quando o user é creator da turma e retorna status=created", async () => {
    mocks.findTurmaWithSchoolById.mockResolvedValue(turmaFromCreator);
    mocks.userHasMemberInTurma.mockResolvedValue(false); // creator nem precisa
    mocks.insertSubjectIfNotExists.mockResolvedValue({
      status: "created",
      subject: subjectByMember,
      filled: noFilled,
    });

    const result = await createSubject(creator.id, {
      turmaId,
      name: "Matemática",
      teacherName: undefined,
      classDays: [],
      alternatingSlots: [],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe("created");
      expect(result.value.filled).toEqual(noFilled);
    }
    expect(mocks.insertSubjectIfNotExists).toHaveBeenCalled();
    // Creator não precisa passar pela query de membership (short-circuit).
    expect(mocks.userHasMemberInTurma).not.toHaveBeenCalled();
  });

  it("aceita quando o user é membro não-creator", async () => {
    mocks.findTurmaWithSchoolById.mockResolvedValue(turmaFromCreator);
    mocks.userHasMemberInTurma.mockResolvedValue(true);
    mocks.insertSubjectIfNotExists.mockResolvedValue({
      status: "created",
      subject: { ...subjectByMember, createdByUserId: member.id },
      filled: noFilled,
    });

    const result = await createSubject(member.id, {
      turmaId,
      name: "Educação Física",
      teacherName: undefined,
      classDays: [],
      alternatingSlots: [],
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
      classDays: [],
      alternatingSlots: [],
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
      classDays: [],
      alternatingSlots: [],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("TURMA_NOT_FOUND");
  });

  it("retorna status=merged_noop quando insertSubjectIfNotExists devolve status=skipped", async () => {
    // Matéria já existia idêntica — fluxo fill-in-blank não tinha o que
    // preencher. UI mostra toast "matéria já estava cadastrada".
    mocks.findTurmaWithSchoolById.mockResolvedValue(turmaFromCreator);
    mocks.userHasMemberInTurma.mockResolvedValue(true);
    mocks.insertSubjectIfNotExists.mockResolvedValue({
      status: "skipped",
      subject: subjectByMember,
      filled: noFilled,
    });

    const result = await createSubject(member.id, {
      turmaId,
      name: "Matemática",
      teacherName: undefined,
      classDays: [],
      alternatingSlots: [],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe("merged_noop");
      expect(result.value.filled).toEqual(noFilled);
    }
  });

  it("retorna status=merged_filled quando insertSubjectIfNotExists fundiu campos em branco", async () => {
    // Matéria existia sem professor; user passou professor → merge fill-in-blank.
    mocks.findTurmaWithSchoolById.mockResolvedValue(turmaFromCreator);
    mocks.userHasMemberInTurma.mockResolvedValue(true);
    mocks.insertSubjectIfNotExists.mockResolvedValue({
      status: "merged",
      subject: { ...subjectByMember, teacherName: "Carla" },
      filled: { teacherName: true, classDays: false },
    });

    const result = await createSubject(member.id, {
      turmaId,
      name: "Matemática",
      teacherName: "Carla",
      classDays: [],
      alternatingSlots: [],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe("merged_filled");
      expect(result.value.filled).toEqual({ teacherName: true, classDays: false });
    }
  });
});

describe("createSubjectsBatch", () => {
  it("rejeita TURMA_NOT_FOUND quando turma não existe", async () => {
    mocks.findTurmaWithSchoolById.mockResolvedValue(null);

    const result = await createSubjectsBatch(member.id, {
      turmaId,
      subjects: [{ name: "Matemática", teacherName: undefined, classDays: [] }],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("TURMA_NOT_FOUND");
    expect(mocks.insertSubjectIfNotExists).not.toHaveBeenCalled();
  });

  it("rejeita NOT_A_MEMBER e não chama insert algum", async () => {
    mocks.findTurmaWithSchoolById.mockResolvedValue(turmaFromCreator);
    mocks.userHasMemberInTurma.mockResolvedValue(false);

    const result = await createSubjectsBatch(otherUser.id, {
      turmaId,
      subjects: [
        { name: "Matemática", teacherName: undefined, classDays: [] },
        { name: "Português", teacherName: "Carla", classDays: [] },
      ],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_A_MEMBER");
    expect(mocks.insertSubjectIfNotExists).not.toHaveBeenCalled();
  });

  it("retorna counts de mix created/merged/skipped e itens preservando nome+status", async () => {
    mocks.findTurmaWithSchoolById.mockResolvedValue(turmaFromCreator);
    mocks.userHasMemberInTurma.mockResolvedValue(true);
    mocks.insertSubjectIfNotExists
      .mockResolvedValueOnce({
        status: "created",
        subject: { ...subjectByMember, id: "s1" },
        filled: noFilled,
      })
      .mockResolvedValueOnce({
        status: "merged",
        subject: { ...subjectByMember, id: "s2" },
        filled: { teacherName: true, classDays: false },
      })
      .mockResolvedValueOnce({
        status: "skipped",
        subject: { ...subjectByMember, id: "s3" },
        filled: noFilled,
      });

    const result = await createSubjectsBatch(member.id, {
      turmaId,
      subjects: [
        { name: "Matemática", teacherName: undefined, classDays: [] },
        { name: "Português", teacherName: "Carla", classDays: [] },
        { name: "Inglês", teacherName: undefined, classDays: [] },
      ],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.counts).toEqual({ created: 1, merged: 1, skipped: 1 });
      expect(result.value.items).toEqual([
        { name: "Matemática", status: "created", id: "s1" },
        { name: "Português", status: "merged", id: "s2" },
        { name: "Inglês", status: "skipped", id: "s3" },
      ]);
      expect(result.value.turmaId).toBe(turmaId);
    }
    expect(mocks.insertSubjectIfNotExists).toHaveBeenCalledTimes(3);
  });

  it("creator também passa: bypass de userHasMemberInTurma quando é dono da turma", async () => {
    mocks.findTurmaWithSchoolById.mockResolvedValue(turmaFromCreator);
    mocks.insertSubjectIfNotExists.mockResolvedValue({
      status: "created",
      subject: { ...subjectByMember, id: "s_creator" },
      filled: noFilled,
    });

    const result = await createSubjectsBatch(creator.id, {
      turmaId,
      subjects: [{ name: "Matemática", teacherName: undefined, classDays: [] }],
    });

    expect(result.ok).toBe(true);
    expect(mocks.userHasMemberInTurma).not.toHaveBeenCalled();
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
      classDays: [],
      alternatingSlots: [],
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
      classDays: [],
      alternatingSlots: [],
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
      classDays: [],
      alternatingSlots: [],
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
      classDays: [],
      alternatingSlots: [],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NAME_CHANGE_TOO_BIG");
    expect(mocks.updateSubjectById).not.toHaveBeenCalled();
  });

  it("rejeita DUPLICATE quando já existe outra matéria com o novo nome na turma", async () => {
    mocks.findSubjectById.mockResolvedValue(subjectByMember);
    mocks.subjectNameExistsInTurmaExceptId.mockResolvedValue(true);

    const result = await updateSubject(member.id, {
      id: subjectId,
      name: "Português",
      teacherName: undefined,
      classDays: [],
      alternatingSlots: [],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("DUPLICATE");
    expect(mocks.subjectNameExistsInTurmaExceptId).toHaveBeenCalledWith(
      turmaId,
      "Português",
      subjectId,
    );
    expect(mocks.isSubjectInUseByOtherUsers).not.toHaveBeenCalled();
    expect(mocks.updateSubjectById).not.toHaveBeenCalled();
  });

  it("aceita edit só do professor sem verificar in-use", async () => {
    mocks.findSubjectById.mockResolvedValue(subjectByMember);
    mocks.updateSubjectById.mockResolvedValue({ ...subjectByMember, teacherName: "Carla" });

    const result = await updateSubject(member.id, {
      id: subjectId,
      name: subjectByMember.name, // nome inalterado
      teacherName: "Carla",
      classDays: [],
      alternatingSlots: [],
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
      classDays: [],
      alternatingSlots: [],
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
      classDays: [],
      alternatingSlots: [],
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
