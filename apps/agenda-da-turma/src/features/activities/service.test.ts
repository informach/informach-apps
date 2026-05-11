import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createActivity,
  deleteActivity,
  respondSharedActivity,
  setActivityStatus,
  updateActivity,
} from "./service";

const mocks = vi.hoisted(() => ({
  // billing
  hasProSubscription: vi.fn<(...args: unknown[]) => Promise<boolean>>(),
  // turmas/repository
  findTurmaWithSchoolById: vi.fn(),
  // activities/repository
  findActivityById: vi.fn(),
  subjectBelongsToTurma: vi.fn(),
  profileBelongsToUser: vi.fn(),
  userIsTurmaCreatorOrMember: vi.fn(),
  hasOtherAcceptances: vi.fn(),
  insertActivityWithStatuses: vi.fn(),
  updateActivityById: vi.fn(),
  deleteActivityById: vi.fn(),
  findActivityStatusForProfile: vi.fn(),
  updateActivityStatusValue: vi.fn(),
  upsertAcceptanceAndStatuses: vi.fn(),
  listActivitiesForUser: vi.fn(),
  listPendingSharedActivitiesForUser: vi.fn(),
  listTurmasWithSubjectsForUserForm: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@informach/auth/server-actions", () => ({
  ok: <T>(value: T) => ({ ok: true as const, value }),
  err: <E>(error: E) => ({ ok: false as const, error }),
}));

vi.mock("@/features/billing/service", () => ({
  billing: { hasProSubscription: mocks.hasProSubscription },
}));

vi.mock("@/features/turmas/repository", () => ({
  findTurmaWithSchoolById: mocks.findTurmaWithSchoolById,
}));

vi.mock("./repository", () => ({
  findActivityById: mocks.findActivityById,
  subjectBelongsToTurma: mocks.subjectBelongsToTurma,
  profileBelongsToUser: mocks.profileBelongsToUser,
  userIsTurmaCreatorOrMember: mocks.userIsTurmaCreatorOrMember,
  hasOtherAcceptances: mocks.hasOtherAcceptances,
  insertActivityWithStatuses: mocks.insertActivityWithStatuses,
  updateActivityById: mocks.updateActivityById,
  deleteActivityById: mocks.deleteActivityById,
  findActivityStatusForProfile: mocks.findActivityStatusForProfile,
  updateActivityStatusValue: mocks.updateActivityStatusValue,
  upsertAcceptanceAndStatuses: mocks.upsertAcceptanceAndStatuses,
  listActivitiesForUser: mocks.listActivitiesForUser,
  listPendingSharedActivitiesForUser: mocks.listPendingSharedActivitiesForUser,
  listTurmasWithSubjectsForUserForm: mocks.listTurmasWithSubjectsForUserForm,
}));

const creator = { id: "user_creator" };
const other = { id: "user_other" };
const turmaId = "turma_1";
const subjectId = "subj_1";
const profileId = "profile_1";
const activityId = "activity_1";

const baseTurma = {
  id: turmaId,
  createdByUserId: creator.id,
} as never;

const baseActivity = {
  id: activityId,
  turmaId,
  subjectId,
  createdByUserId: creator.id,
  type: "task" as const,
  visibility: "individual" as const,
  title: "Páginas 32-33",
  description: null,
  dueAt: "2026-06-01",
  createdAt: new Date(),
  updatedAt: new Date(),
};

const createInput = {
  turmaId,
  subjectId,
  type: "task" as const,
  title: "Páginas 32-33",
  description: undefined,
  dueAt: "2026-06-01",
  visibility: "individual" as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.hasProSubscription.mockResolvedValue(false);
});

describe("createActivity", () => {
  it("cria atividade individual quando user é membro", async () => {
    mocks.findTurmaWithSchoolById.mockResolvedValue(baseTurma);
    mocks.userIsTurmaCreatorOrMember.mockResolvedValue(true);
    mocks.subjectBelongsToTurma.mockResolvedValue(true);
    mocks.insertActivityWithStatuses.mockResolvedValue(baseActivity);

    const result = await createActivity(creator.id, createInput);

    expect(result.ok).toBe(true);
    expect(mocks.insertActivityWithStatuses).toHaveBeenCalledWith(
      expect.objectContaining({ visibility: "individual" }),
    );
    // Pro check só roda quando input pede shared.
    expect(mocks.hasProSubscription).not.toHaveBeenCalled();
  });

  it("força visibility=individual quando Free pede shared_with_turma", async () => {
    mocks.findTurmaWithSchoolById.mockResolvedValue(baseTurma);
    mocks.userIsTurmaCreatorOrMember.mockResolvedValue(true);
    mocks.subjectBelongsToTurma.mockResolvedValue(true);
    mocks.hasProSubscription.mockResolvedValue(false);
    mocks.insertActivityWithStatuses.mockResolvedValue({
      ...baseActivity,
      visibility: "individual",
    });

    const result = await createActivity(creator.id, {
      ...createInput,
      visibility: "shared_with_turma",
    });

    expect(result.ok).toBe(true);
    expect(mocks.insertActivityWithStatuses).toHaveBeenCalledWith(
      expect.objectContaining({ visibility: "individual" }),
    );
  });

  it("preserva visibility=shared_with_turma quando Pro", async () => {
    mocks.findTurmaWithSchoolById.mockResolvedValue(baseTurma);
    mocks.userIsTurmaCreatorOrMember.mockResolvedValue(true);
    mocks.subjectBelongsToTurma.mockResolvedValue(true);
    mocks.hasProSubscription.mockResolvedValue(true);
    mocks.insertActivityWithStatuses.mockResolvedValue({
      ...baseActivity,
      visibility: "shared_with_turma",
    });

    const result = await createActivity(creator.id, {
      ...createInput,
      visibility: "shared_with_turma",
    });

    expect(result.ok).toBe(true);
    expect(mocks.insertActivityWithStatuses).toHaveBeenCalledWith(
      expect.objectContaining({ visibility: "shared_with_turma" }),
    );
  });

  it("rejeita TURMA_NOT_FOUND quando turma não existe", async () => {
    mocks.findTurmaWithSchoolById.mockResolvedValue(null);

    const result = await createActivity(creator.id, createInput);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("TURMA_NOT_FOUND");
  });

  it("rejeita NOT_A_MEMBER quando user não é creator nem membro", async () => {
    mocks.findTurmaWithSchoolById.mockResolvedValue(baseTurma);
    mocks.userIsTurmaCreatorOrMember.mockResolvedValue(false);

    const result = await createActivity(other.id, createInput);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_A_MEMBER");
  });

  it("rejeita SUBJECT_NOT_FOUND quando matéria não pertence à turma", async () => {
    mocks.findTurmaWithSchoolById.mockResolvedValue(baseTurma);
    mocks.userIsTurmaCreatorOrMember.mockResolvedValue(true);
    mocks.subjectBelongsToTurma.mockResolvedValue(false);

    const result = await createActivity(creator.id, createInput);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("SUBJECT_NOT_FOUND");
  });
});

describe("updateActivity", () => {
  const updateInput = {
    id: activityId,
    type: "exam" as const,
    title: "Prova surpresa",
    description: undefined,
    dueAt: "2026-06-05",
  };

  it("atualiza individual livremente pelo creator", async () => {
    mocks.findActivityById.mockResolvedValue(baseActivity);
    mocks.updateActivityById.mockResolvedValue({ ...baseActivity, ...updateInput });

    const result = await updateActivity(creator.id, updateInput);

    expect(result.ok).toBe(true);
    expect(mocks.hasOtherAcceptances).not.toHaveBeenCalled();
  });

  it("atualiza compartilhada sem acceptances", async () => {
    mocks.findActivityById.mockResolvedValue({ ...baseActivity, visibility: "shared_with_turma" });
    mocks.hasOtherAcceptances.mockResolvedValue(false);
    mocks.updateActivityById.mockResolvedValue({ ...baseActivity, ...updateInput });

    const result = await updateActivity(creator.id, updateInput);

    expect(result.ok).toBe(true);
  });

  it("rejeita HAS_ACCEPTANCES quando compartilhada e alguém aceitou", async () => {
    mocks.findActivityById.mockResolvedValue({ ...baseActivity, visibility: "shared_with_turma" });
    mocks.hasOtherAcceptances.mockResolvedValue(true);

    const result = await updateActivity(creator.id, updateInput);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("HAS_ACCEPTANCES");
    expect(mocks.updateActivityById).not.toHaveBeenCalled();
  });

  it("rejeita FORBIDDEN quando não-criador tenta editar", async () => {
    mocks.findActivityById.mockResolvedValue(baseActivity);

    const result = await updateActivity(other.id, updateInput);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
  });

  it("rejeita NOT_FOUND quando atividade não existe", async () => {
    mocks.findActivityById.mockResolvedValue(null);

    const result = await updateActivity(creator.id, updateInput);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_FOUND");
  });
});

describe("deleteActivity", () => {
  it("deleta individual pelo creator", async () => {
    mocks.findActivityById.mockResolvedValue(baseActivity);
    mocks.deleteActivityById.mockResolvedValue(true);

    const result = await deleteActivity(creator.id, { id: activityId });

    expect(result.ok).toBe(true);
  });

  it("rejeita HAS_ACCEPTANCES quando compartilhada e aceita por outros", async () => {
    mocks.findActivityById.mockResolvedValue({ ...baseActivity, visibility: "shared_with_turma" });
    mocks.hasOtherAcceptances.mockResolvedValue(true);

    const result = await deleteActivity(creator.id, { id: activityId });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("HAS_ACCEPTANCES");
  });

  it("rejeita FORBIDDEN quando não-criador tenta excluir", async () => {
    mocks.findActivityById.mockResolvedValue(baseActivity);

    const result = await deleteActivity(other.id, { id: activityId });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
  });
});

describe("setActivityStatus", () => {
  it("atualiza quando perfil pertence ao user", async () => {
    mocks.profileBelongsToUser.mockResolvedValue(true);
    mocks.findActivityStatusForProfile.mockResolvedValue({ id: "status_1", status: "pending" });
    mocks.updateActivityStatusValue.mockResolvedValue(true);

    const result = await setActivityStatus(creator.id, {
      activityId,
      studentProfileId: profileId,
      status: "done",
    });

    expect(result.ok).toBe(true);
    expect(mocks.updateActivityStatusValue).toHaveBeenCalledWith("status_1", "done");
  });

  it("rejeita INVALID_PROFILE quando perfil é de outro user", async () => {
    mocks.profileBelongsToUser.mockResolvedValue(false);

    const result = await setActivityStatus(other.id, {
      activityId,
      studentProfileId: profileId,
      status: "done",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_PROFILE");
    expect(mocks.updateActivityStatusValue).not.toHaveBeenCalled();
  });

  it("rejeita NOT_FOUND quando status row não existe", async () => {
    mocks.profileBelongsToUser.mockResolvedValue(true);
    mocks.findActivityStatusForProfile.mockResolvedValue(null);

    const result = await setActivityStatus(creator.id, {
      activityId,
      studentProfileId: profileId,
      status: "done",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_FOUND");
  });
});

describe("respondSharedActivity", () => {
  const sharedActivity = { ...baseActivity, visibility: "shared_with_turma" as const };

  it("aceita compartilhada de outro user e gera statuses", async () => {
    mocks.findActivityById.mockResolvedValue(sharedActivity);
    mocks.userIsTurmaCreatorOrMember.mockResolvedValue(true);

    const result = await respondSharedActivity(other.id, { activityId, accepted: true });

    expect(result.ok).toBe(true);
    expect(mocks.upsertAcceptanceAndStatuses).toHaveBeenCalledWith(
      activityId,
      other.id,
      true,
      turmaId,
    );
  });

  it("rejeita compartilhada sem gerar statuses", async () => {
    mocks.findActivityById.mockResolvedValue(sharedActivity);
    mocks.userIsTurmaCreatorOrMember.mockResolvedValue(true);

    const result = await respondSharedActivity(other.id, { activityId, accepted: false });

    expect(result.ok).toBe(true);
    expect(mocks.upsertAcceptanceAndStatuses).toHaveBeenCalledWith(
      activityId,
      other.id,
      false,
      turmaId,
    );
  });

  it("rejeita NOT_SHARED quando atividade é individual", async () => {
    mocks.findActivityById.mockResolvedValue(baseActivity);

    const result = await respondSharedActivity(other.id, { activityId, accepted: true });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_SHARED");
    expect(mocks.upsertAcceptanceAndStatuses).not.toHaveBeenCalled();
  });

  it("rejeita FORBIDDEN quando o creator tenta responder", async () => {
    mocks.findActivityById.mockResolvedValue(sharedActivity);

    const result = await respondSharedActivity(creator.id, { activityId, accepted: true });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
  });

  it("rejeita NOT_A_MEMBER quando user não é da turma", async () => {
    mocks.findActivityById.mockResolvedValue(sharedActivity);
    mocks.userIsTurmaCreatorOrMember.mockResolvedValue(false);

    const result = await respondSharedActivity(other.id, { activityId, accepted: true });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_A_MEMBER");
  });

  it("rejeita NOT_FOUND quando atividade não existe", async () => {
    mocks.findActivityById.mockResolvedValue(null);

    const result = await respondSharedActivity(other.id, { activityId, accepted: true });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_FOUND");
  });
});
