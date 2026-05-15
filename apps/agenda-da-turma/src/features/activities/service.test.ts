import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createActivitiesBatch,
  createActivity,
  deleteActivity,
  getActivitiesPageForUser,
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
  userHasActiveProfileInTurma: vi.fn(),
  hasOtherAcceptances: vi.fn(),
  insertActivitiesBatchWithStatuses: vi.fn(),
  insertActivityWithStatuses: vi.fn(),
  insertActivityWithStatusesWithinFreeLimit: vi.fn(),
  countActivitiesCreatedByUser: vi.fn(),
  updateActivityById: vi.fn(),
  deleteActivityById: vi.fn(),
  findActivityStatusForProfile: vi.fn(),
  updateActivityStatusValue: vi.fn(),
  upsertAcceptanceAndStatuses: vi.fn(),
  listActivitiesPageForUser: vi.fn(),
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
  userHasActiveProfileInTurma: mocks.userHasActiveProfileInTurma,
  hasOtherAcceptances: mocks.hasOtherAcceptances,
  insertActivitiesBatchWithStatuses: mocks.insertActivitiesBatchWithStatuses,
  insertActivityWithStatuses: mocks.insertActivityWithStatuses,
  insertActivityWithStatusesWithinFreeLimit: mocks.insertActivityWithStatusesWithinFreeLimit,
  countActivitiesCreatedByUser: mocks.countActivitiesCreatedByUser,
  updateActivityById: mocks.updateActivityById,
  deleteActivityById: mocks.deleteActivityById,
  findActivityStatusForProfile: mocks.findActivityStatusForProfile,
  updateActivityStatusValue: mocks.updateActivityStatusValue,
  upsertAcceptanceAndStatuses: mocks.upsertAcceptanceAndStatuses,
  listActivitiesPageForUser: mocks.listActivitiesPageForUser,
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
  mocks.userHasActiveProfileInTurma.mockResolvedValue(true);
});

describe("createActivity", () => {
  it("cria atividade individual quando Free abaixo do limite (caminho transacional)", async () => {
    mocks.findTurmaWithSchoolById.mockResolvedValue(baseTurma);
    mocks.subjectBelongsToTurma.mockResolvedValue(true);
    mocks.hasProSubscription.mockResolvedValue(false);
    mocks.insertActivityWithStatusesWithinFreeLimit.mockResolvedValue({
      ok: true,
      activity: baseActivity,
    });

    const result = await createActivity(creator.id, createInput);

    expect(result.ok).toBe(true);
    // Free passa pelo helper transacional com lock + count + insert.
    expect(mocks.insertActivityWithStatusesWithinFreeLimit).toHaveBeenCalledWith(
      expect.objectContaining({ visibility: "individual" }),
      20,
    );
    expect(mocks.insertActivityWithStatuses).not.toHaveBeenCalled();
  });

  it("cria atividade individual direto quando Pro (sem helper de limite)", async () => {
    mocks.findTurmaWithSchoolById.mockResolvedValue(baseTurma);
    mocks.subjectBelongsToTurma.mockResolvedValue(true);
    mocks.hasProSubscription.mockResolvedValue(true);
    mocks.insertActivityWithStatuses.mockResolvedValue(baseActivity);

    const result = await createActivity(creator.id, createInput);

    expect(result.ok).toBe(true);
    expect(mocks.insertActivityWithStatuses).toHaveBeenCalledWith(
      expect.objectContaining({ visibility: "individual" }),
    );
    expect(mocks.insertActivityWithStatusesWithinFreeLimit).not.toHaveBeenCalled();
  });

  it("força visibility=individual quando Free pede shared_with_turma", async () => {
    mocks.findTurmaWithSchoolById.mockResolvedValue(baseTurma);
    mocks.subjectBelongsToTurma.mockResolvedValue(true);
    mocks.hasProSubscription.mockResolvedValue(false);
    mocks.insertActivityWithStatusesWithinFreeLimit.mockResolvedValue({
      ok: true,
      activity: { ...baseActivity, visibility: "individual" },
    });

    const result = await createActivity(creator.id, {
      ...createInput,
      visibility: "shared_with_turma",
    });

    expect(result.ok).toBe(true);
    expect(mocks.insertActivityWithStatusesWithinFreeLimit).toHaveBeenCalledWith(
      expect.objectContaining({ visibility: "individual" }),
      20,
    );
  });

  it("preserva visibility=shared_with_turma quando Pro", async () => {
    mocks.findTurmaWithSchoolById.mockResolvedValue(baseTurma);
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

  it("retorna ACTIVITY_LIMIT_REACHED quando Free atinge limite de 20", async () => {
    mocks.findTurmaWithSchoolById.mockResolvedValue(baseTurma);
    mocks.subjectBelongsToTurma.mockResolvedValue(true);
    mocks.hasProSubscription.mockResolvedValue(false);
    mocks.insertActivityWithStatusesWithinFreeLimit.mockResolvedValue({
      ok: false,
      current: 20,
    });

    const result = await createActivity(creator.id, createInput);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("ACTIVITY_LIMIT_REACHED");
      if (result.error.code === "ACTIVITY_LIMIT_REACHED") {
        expect(result.error.limit).toBe(20);
        expect(result.error.current).toBe(20);
      }
    }
    expect(mocks.insertActivityWithStatuses).not.toHaveBeenCalled();
  });

  it("rejeita TURMA_NOT_FOUND quando turma não existe", async () => {
    mocks.findTurmaWithSchoolById.mockResolvedValue(null);

    const result = await createActivity(creator.id, createInput);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("TURMA_NOT_FOUND");
  });

  it("rejeita NOT_A_MEMBER quando user não tem perfil ativo na turma", async () => {
    mocks.findTurmaWithSchoolById.mockResolvedValue(baseTurma);
    mocks.userHasActiveProfileInTurma.mockResolvedValue(false);

    const result = await createActivity(other.id, createInput);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_A_MEMBER");
    expect(mocks.insertActivityWithStatusesWithinFreeLimit).not.toHaveBeenCalled();
  });

  it("rejeita SUBJECT_NOT_FOUND quando matéria não pertence à turma", async () => {
    mocks.findTurmaWithSchoolById.mockResolvedValue(baseTurma);
    mocks.subjectBelongsToTurma.mockResolvedValue(false);

    const result = await createActivity(creator.id, createInput);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("SUBJECT_NOT_FOUND");
  });
});

describe("createActivitiesBatch", () => {
  const batchInput = {
    visibility: "individual" as const,
    activities: [
      {
        turmaId,
        subjectId,
        type: "task" as const,
        title: "Páginas 10-12",
        description: undefined,
        dueAt: "2026-06-01",
      },
    ],
  };

  it("rejeita NOT_A_MEMBER quando o user não tem perfil ativo na turma", async () => {
    mocks.hasProSubscription.mockResolvedValue(true);
    mocks.findTurmaWithSchoolById.mockResolvedValue(baseTurma);
    mocks.userHasActiveProfileInTurma.mockResolvedValue(false);

    const result = await createActivitiesBatch(other.id, batchInput);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toEqual({ code: "NOT_A_MEMBER", index: 0 });
    }
    expect(mocks.subjectBelongsToTurma).not.toHaveBeenCalled();
    expect(mocks.insertActivitiesBatchWithStatuses).not.toHaveBeenCalled();
  });

  it("insere batch quando Pro tem perfil ativo e matéria válida", async () => {
    mocks.hasProSubscription.mockResolvedValue(true);
    mocks.findTurmaWithSchoolById.mockResolvedValue(baseTurma);
    mocks.subjectBelongsToTurma.mockResolvedValue(true);
    mocks.insertActivitiesBatchWithStatuses.mockResolvedValue([baseActivity]);

    const result = await createActivitiesBatch(creator.id, batchInput);

    expect(result.ok).toBe(true);
    expect(mocks.userHasActiveProfileInTurma).toHaveBeenCalledWith(creator.id, turmaId);
    expect(mocks.insertActivitiesBatchWithStatuses).toHaveBeenCalledWith([
      expect.objectContaining({
        createdByUserId: creator.id,
        turmaId,
        subjectId,
        visibility: "individual",
      }),
    ]);
  });
});

describe("updateActivity", () => {
  const updateInput = {
    id: activityId,
    subjectId,
    type: "exam" as const,
    title: "Prova surpresa",
    description: undefined,
    dueAt: "2026-06-05",
    visibility: "individual" as const,
  };

  it("atualiza individual livremente pelo creator", async () => {
    mocks.findActivityById.mockResolvedValue(baseActivity);
    mocks.subjectBelongsToTurma.mockResolvedValue(true);
    mocks.updateActivityById.mockResolvedValue({ ...baseActivity, ...updateInput });

    const result = await updateActivity(creator.id, updateInput);

    expect(result.ok).toBe(true);
    expect(mocks.hasOtherAcceptances).not.toHaveBeenCalled();
  });

  it("atualiza compartilhada sem acceptances", async () => {
    mocks.findActivityById.mockResolvedValue({ ...baseActivity, visibility: "shared_with_turma" });
    mocks.hasOtherAcceptances.mockResolvedValue(false);
    mocks.subjectBelongsToTurma.mockResolvedValue(true);
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
    expect(mocks.subjectBelongsToTurma).not.toHaveBeenCalled();
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

  it("aceita troca de matéria para outra subject da mesma turma", async () => {
    mocks.findActivityById.mockResolvedValue(baseActivity);
    mocks.subjectBelongsToTurma.mockResolvedValue(true);
    mocks.updateActivityById.mockResolvedValue({
      ...baseActivity,
      subjectId: "subj_2",
    });

    const result = await updateActivity(creator.id, { ...updateInput, subjectId: "subj_2" });

    expect(result.ok).toBe(true);
    // Validação SEMPRE usa activity.turmaId do banco, nunca turma do input.
    expect(mocks.subjectBelongsToTurma).toHaveBeenCalledWith("subj_2", turmaId);
    expect(mocks.updateActivityById).toHaveBeenCalledWith(
      activityId,
      expect.objectContaining({ subjectId: "subj_2" }),
    );
  });

  it("rejeita SUBJECT_NOT_FOUND quando matéria não pertence à turma original", async () => {
    mocks.findActivityById.mockResolvedValue(baseActivity);
    mocks.subjectBelongsToTurma.mockResolvedValue(false);

    const result = await updateActivity(creator.id, { ...updateInput, subjectId: "subj_other" });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("SUBJECT_NOT_FOUND");
    expect(mocks.updateActivityById).not.toHaveBeenCalled();
  });

  it("preserva visibility=shared_with_turma quando Pro flipa individual → shared (sem acceptances)", async () => {
    mocks.findActivityById.mockResolvedValue(baseActivity);
    mocks.subjectBelongsToTurma.mockResolvedValue(true);
    mocks.hasProSubscription.mockResolvedValue(true);
    mocks.updateActivityById.mockResolvedValue({
      ...baseActivity,
      visibility: "shared_with_turma",
    });

    const result = await updateActivity(creator.id, {
      ...updateInput,
      visibility: "shared_with_turma",
    });

    expect(result.ok).toBe(true);
    expect(mocks.updateActivityById).toHaveBeenCalledWith(
      activityId,
      expect.objectContaining({ visibility: "shared_with_turma" }),
    );
  });

  it("força visibility=individual quando Free tenta setar shared (defesa em profundidade)", async () => {
    mocks.findActivityById.mockResolvedValue(baseActivity);
    mocks.subjectBelongsToTurma.mockResolvedValue(true);
    mocks.hasProSubscription.mockResolvedValue(false);
    mocks.updateActivityById.mockResolvedValue(baseActivity);

    const result = await updateActivity(creator.id, {
      ...updateInput,
      visibility: "shared_with_turma",
    });

    expect(result.ok).toBe(true);
    expect(mocks.updateActivityById).toHaveBeenCalledWith(
      activityId,
      expect.objectContaining({ visibility: "individual" }),
    );
  });

  it("permite Pro flipar shared → individual quando ninguém aceitou", async () => {
    mocks.findActivityById.mockResolvedValue({ ...baseActivity, visibility: "shared_with_turma" });
    mocks.hasOtherAcceptances.mockResolvedValue(false);
    mocks.subjectBelongsToTurma.mockResolvedValue(true);
    mocks.hasProSubscription.mockResolvedValue(true);
    mocks.updateActivityById.mockResolvedValue({ ...baseActivity, visibility: "individual" });

    const result = await updateActivity(creator.id, {
      ...updateInput,
      visibility: "individual",
    });

    expect(result.ok).toBe(true);
    expect(mocks.updateActivityById).toHaveBeenCalledWith(
      activityId,
      expect.objectContaining({ visibility: "individual" }),
    );
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
    mocks.hasProSubscription.mockResolvedValue(true);
    mocks.userHasActiveProfileInTurma.mockResolvedValue(true);

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
    mocks.hasProSubscription.mockResolvedValue(true);
    mocks.userHasActiveProfileInTurma.mockResolvedValue(true);

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

  it("rejeita PRO_REQUIRED quando Free tenta responder compartilhada", async () => {
    mocks.findActivityById.mockResolvedValue(sharedActivity);
    mocks.hasProSubscription.mockResolvedValue(false);

    const result = await respondSharedActivity(other.id, { activityId, accepted: true });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("PRO_REQUIRED");
    expect(mocks.userHasActiveProfileInTurma).not.toHaveBeenCalled();
    expect(mocks.upsertAcceptanceAndStatuses).not.toHaveBeenCalled();
  });

  it("rejeita NOT_A_MEMBER quando user não é da turma", async () => {
    mocks.findActivityById.mockResolvedValue(sharedActivity);
    mocks.hasProSubscription.mockResolvedValue(true);
    mocks.userHasActiveProfileInTurma.mockResolvedValue(false);

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

  it("rejeita DUE_DATE_PASSED quando prazo da atividade já passou", async () => {
    const expiredActivity = { ...sharedActivity, dueAt: "2020-01-01" };
    mocks.findActivityById.mockResolvedValue(expiredActivity);
    mocks.hasProSubscription.mockResolvedValue(true);

    const result = await respondSharedActivity(other.id, { activityId, accepted: true });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("DUE_DATE_PASSED");
    expect(mocks.userHasActiveProfileInTurma).not.toHaveBeenCalled();
    expect(mocks.upsertAcceptanceAndStatuses).not.toHaveBeenCalled();
  });
});

describe("shared activity edit-block chain (creator vs acceptor)", () => {
  // Encadeia o fluxo "creator cria shared → outro user aceita → creator
  // tenta editar/deletar → bloqueado por HAS_ACCEPTANCES" em um único
  // cenário. Os steps individuais já têm cobertura em createActivity/
  // respondSharedActivity/updateActivity/deleteActivity — este teste
  // serve como documentação executável da regra de governança quando
  // múltiplas famílias compartilham uma atividade.
  const sharedActivity = {
    ...baseActivity,
    visibility: "shared_with_turma" as const,
  };

  it("aceitar trava update + delete subsequentes do criador", async () => {
    // 1. Creator cria atividade shared (Pro path, sem helper de free limit)
    mocks.findTurmaWithSchoolById.mockResolvedValue(baseTurma);
    mocks.subjectBelongsToTurma.mockResolvedValue(true);
    mocks.hasProSubscription.mockResolvedValue(true);
    mocks.insertActivityWithStatuses.mockResolvedValue(sharedActivity);

    const created = await createActivity(creator.id, {
      ...createInput,
      visibility: "shared_with_turma",
    });
    expect(created.ok).toBe(true);

    // 2. Outro user (Pro também, membro da turma) aceita
    mocks.findActivityById.mockResolvedValue(sharedActivity);
    mocks.userHasActiveProfileInTurma.mockResolvedValue(true);

    const accepted = await respondSharedActivity(other.id, {
      activityId,
      accepted: true,
    });
    expect(accepted.ok).toBe(true);
    expect(mocks.upsertAcceptanceAndStatuses).toHaveBeenCalledWith(
      activityId,
      other.id,
      true,
      turmaId,
    );

    // 3. Creator tenta editar — agora hasOtherAcceptances=true
    mocks.findActivityById.mockResolvedValue(sharedActivity);
    mocks.hasOtherAcceptances.mockResolvedValue(true);

    const updateAttempt = await updateActivity(creator.id, {
      id: activityId,
      subjectId,
      type: "task",
      title: "Edit attempt — should fail",
      description: undefined,
      dueAt: "2026-06-05",
      visibility: "shared_with_turma",
    });
    expect(updateAttempt.ok).toBe(false);
    if (!updateAttempt.ok) expect(updateAttempt.error.code).toBe("HAS_ACCEPTANCES");
    expect(mocks.updateActivityById).not.toHaveBeenCalled();

    // 4. Creator tenta deletar — mesma trava
    const deleteAttempt = await deleteActivity(creator.id, { id: activityId });
    expect(deleteAttempt.ok).toBe(false);
    if (!deleteAttempt.ok) expect(deleteAttempt.error.code).toBe("HAS_ACCEPTANCES");
    expect(mocks.deleteActivityById).not.toHaveBeenCalled();
  });

  it("acceptor não consegue editar/deletar (FORBIDDEN), independente de acceptance", async () => {
    // Edit pela acceptor sempre falha (não é creator).
    mocks.findActivityById.mockResolvedValue(sharedActivity);

    const updateAttempt = await updateActivity(other.id, {
      id: activityId,
      subjectId,
      type: "task",
      title: "Edit attempt by acceptor",
      description: undefined,
      dueAt: "2026-06-05",
      visibility: "shared_with_turma",
    });
    expect(updateAttempt.ok).toBe(false);
    if (!updateAttempt.ok) expect(updateAttempt.error.code).toBe("FORBIDDEN");

    const deleteAttempt = await deleteActivity(other.id, { id: activityId });
    expect(deleteAttempt.ok).toBe(false);
    if (!deleteAttempt.ok) expect(deleteAttempt.error.code).toBe("FORBIDDEN");
  });
});

describe("getActivitiesPageForUser", () => {
  const emptyPage = { items: [], nextCursor: null };

  it("restringe atividades compartilhadas de outros usuários para Free", async () => {
    mocks.hasProSubscription.mockResolvedValue(false);
    mocks.listActivitiesPageForUser.mockResolvedValue(emptyPage);

    const result = await getActivitiesPageForUser(other.id, {
      profileFilter: null,
      cursor: null,
    });

    expect(result).toBe(emptyPage);
    expect(mocks.listActivitiesPageForUser).toHaveBeenCalledWith(other.id, {
      profileFilter: null,
      cursor: null,
      includeSharedFromOthers: false,
    });
  });

  it("inclui atividades compartilhadas de outros usuários para Pro", async () => {
    mocks.hasProSubscription.mockResolvedValue(true);
    mocks.listActivitiesPageForUser.mockResolvedValue(emptyPage);

    const result = await getActivitiesPageForUser(other.id, {
      profileFilter: profileId,
      cursor: "cursor_1",
    });

    expect(result).toBe(emptyPage);
    expect(mocks.listActivitiesPageForUser).toHaveBeenCalledWith(other.id, {
      profileFilter: profileId,
      cursor: "cursor_1",
      includeSharedFromOthers: true,
    });
  });
});
