import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createActivity, deleteActivity, respondSharedActivity, updateActivity } from "./service";

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
  insertActivityWithTasks: vi.fn(),
  insertActivityWithTasksWithinFreeLimit: vi.fn(),
  countActivitiesCreatedByUser: vi.fn(),
  updateActivityById: vi.fn(),
  deleteActivityById: vi.fn(),
  upsertAcceptanceAndTasks: vi.fn(),
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
  insertActivityWithTasks: mocks.insertActivityWithTasks,
  insertActivityWithTasksWithinFreeLimit: mocks.insertActivityWithTasksWithinFreeLimit,
  countActivitiesCreatedByUser: mocks.countActivitiesCreatedByUser,
  updateActivityById: mocks.updateActivityById,
  deleteActivityById: mocks.deleteActivityById,
  upsertAcceptanceAndTasks: mocks.upsertAcceptanceAndTasks,
  listPendingSharedActivitiesForUser: mocks.listPendingSharedActivitiesForUser,
  listTurmasWithSubjectsForUserForm: mocks.listTurmasWithSubjectsForUserForm,
}));

const creator = { id: "user_creator" };
const other = { id: "user_other" };
const turmaId = "turma_1";
const subjectId = "subj_1";
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
  // The activity fixtures are due in June 2026; business rules must not depend on today's date.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-05-01T12:00:00Z"));
  vi.clearAllMocks();
  mocks.hasProSubscription.mockResolvedValue(false);
  mocks.userHasActiveProfileInTurma.mockResolvedValue(true);
});

afterEach(() => vi.useRealTimers());

describe("createActivity", () => {
  it("cria atividade individual quando Free abaixo do limite (caminho transacional)", async () => {
    mocks.findTurmaWithSchoolById.mockResolvedValue(baseTurma);
    mocks.subjectBelongsToTurma.mockResolvedValue(true);
    mocks.hasProSubscription.mockResolvedValue(false);
    mocks.insertActivityWithTasksWithinFreeLimit.mockResolvedValue({
      ok: true,
      activity: baseActivity,
    });

    const result = await createActivity(creator.id, createInput);

    expect(result.ok).toBe(true);
    // Free passa pelo helper transacional com lock + count + insert.
    expect(mocks.insertActivityWithTasksWithinFreeLimit).toHaveBeenCalledWith(
      expect.objectContaining({ visibility: "individual" }),
      20,
    );
    expect(mocks.insertActivityWithTasks).not.toHaveBeenCalled();
  });

  it("cria atividade individual direto quando Pro (sem helper de limite)", async () => {
    mocks.findTurmaWithSchoolById.mockResolvedValue(baseTurma);
    mocks.subjectBelongsToTurma.mockResolvedValue(true);
    mocks.hasProSubscription.mockResolvedValue(true);
    mocks.insertActivityWithTasks.mockResolvedValue(baseActivity);

    const result = await createActivity(creator.id, createInput);

    expect(result.ok).toBe(true);
    expect(mocks.insertActivityWithTasks).toHaveBeenCalledWith(
      expect.objectContaining({ visibility: "individual" }),
    );
    expect(mocks.insertActivityWithTasksWithinFreeLimit).not.toHaveBeenCalled();
  });

  it("recusa quando Free pede shared_with_turma, em vez de salvar individual calado", async () => {
    mocks.findTurmaWithSchoolById.mockResolvedValue(baseTurma);
    mocks.subjectBelongsToTurma.mockResolvedValue(true);
    mocks.hasProSubscription.mockResolvedValue(false);

    const result = await createActivity(creator.id, {
      ...createInput,
      visibility: "shared_with_turma",
    });

    expect(result).toEqual({ ok: false, error: { code: "PRO_REQUIRED" } });
    // Nada é gravado: entregar algo diferente do pedido é pior que recusar.
    expect(mocks.insertActivityWithTasksWithinFreeLimit).not.toHaveBeenCalled();
    expect(mocks.insertActivityWithTasks).not.toHaveBeenCalled();
  });

  it("preserva visibility=shared_with_turma quando Pro", async () => {
    mocks.findTurmaWithSchoolById.mockResolvedValue(baseTurma);
    mocks.subjectBelongsToTurma.mockResolvedValue(true);
    mocks.hasProSubscription.mockResolvedValue(true);
    mocks.insertActivityWithTasks.mockResolvedValue({
      ...baseActivity,
      visibility: "shared_with_turma",
    });

    const result = await createActivity(creator.id, {
      ...createInput,
      visibility: "shared_with_turma",
    });

    expect(result.ok).toBe(true);
    expect(mocks.insertActivityWithTasks).toHaveBeenCalledWith(
      expect.objectContaining({ visibility: "shared_with_turma" }),
    );
  });

  it("retorna ACTIVITY_LIMIT_REACHED quando Free atinge limite de 20", async () => {
    mocks.findTurmaWithSchoolById.mockResolvedValue(baseTurma);
    mocks.subjectBelongsToTurma.mockResolvedValue(true);
    mocks.hasProSubscription.mockResolvedValue(false);
    mocks.insertActivityWithTasksWithinFreeLimit.mockResolvedValue({
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
    expect(mocks.insertActivityWithTasks).not.toHaveBeenCalled();
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
    expect(mocks.insertActivityWithTasksWithinFreeLimit).not.toHaveBeenCalled();
  });

  it("rejeita SUBJECT_NOT_FOUND quando matéria não pertence à turma", async () => {
    mocks.findTurmaWithSchoolById.mockResolvedValue(baseTurma);
    mocks.subjectBelongsToTurma.mockResolvedValue(false);

    const result = await createActivity(creator.id, createInput);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("SUBJECT_NOT_FOUND");
  });
});

describe("updateActivity", () => {
  const updateInput = {
    version: 1,
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

  it("permite correção pelo criador após aceite", async () => {
    mocks.findActivityById.mockResolvedValue({ ...baseActivity, visibility: "shared_with_turma" });
    mocks.hasOtherAcceptances.mockResolvedValue(true);
    mocks.subjectBelongsToTurma.mockResolvedValue(true);
    mocks.updateActivityById.mockResolvedValue({ ...baseActivity, ...updateInput });

    const result = await updateActivity(creator.id, updateInput);

    expect(result.ok).toBe(true);
    expect(mocks.updateActivityById).toHaveBeenCalledWith(
      activityId,
      expect.objectContaining({ title: updateInput.title }),
      creator.id,
      1,
    );
    expect(mocks.subjectBelongsToTurma).toHaveBeenCalledWith(subjectId, turmaId);
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
      creator.id,
      1,
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
      creator.id,
      1,
    );
  });

  it("deixa quem perdeu o Pro editar a atividade que já era compartilhada", async () => {
    // O Pro compra COMPARTILHAR, não continuar compartilhado. Barrar o estado
    // trancaria a pessoa fora da própria atividade por um conserto de digitação.
    mocks.findActivityById.mockResolvedValue({ ...baseActivity, visibility: "shared_with_turma" });
    mocks.subjectBelongsToTurma.mockResolvedValue(true);
    mocks.hasProSubscription.mockResolvedValue(false);
    mocks.updateActivityById.mockResolvedValue(baseActivity);

    const result = await updateActivity(creator.id, {
      ...updateInput,
      visibility: "shared_with_turma",
    });

    expect(result.ok).toBe(true);
  });

  it("recusa quando Free tenta setar shared na edição", async () => {
    mocks.findActivityById.mockResolvedValue(baseActivity);
    mocks.subjectBelongsToTurma.mockResolvedValue(true);
    mocks.hasProSubscription.mockResolvedValue(false);

    const result = await updateActivity(creator.id, {
      ...updateInput,
      visibility: "shared_with_turma",
    });

    expect(result).toEqual({ ok: false, error: { code: "PRO_REQUIRED" } });
    expect(mocks.updateActivityById).not.toHaveBeenCalled();
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
      creator.id,
      1,
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

  it("encaminha cancelamento pelo criador quando compartilhada foi aceita", async () => {
    mocks.findActivityById.mockResolvedValue({ ...baseActivity, visibility: "shared_with_turma" });
    mocks.hasOtherAcceptances.mockResolvedValue(true);

    const result = await deleteActivity(creator.id, { id: activityId });

    expect(result.ok).toBe(true);
    expect(mocks.deleteActivityById).toHaveBeenCalledWith(activityId, creator.id);
  });

  it("rejeita FORBIDDEN quando não-criador tenta excluir", async () => {
    mocks.findActivityById.mockResolvedValue(baseActivity);

    const result = await deleteActivity(other.id, { id: activityId });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
  });
});

describe("respondSharedActivity", () => {
  const sharedActivity = { ...baseActivity, visibility: "shared_with_turma" as const };

  it("aceita compartilhada de outro user e gera tarefas", async () => {
    mocks.findActivityById.mockResolvedValue(sharedActivity);
    mocks.hasProSubscription.mockResolvedValue(true);
    mocks.userHasActiveProfileInTurma.mockResolvedValue(true);

    const result = await respondSharedActivity(other.id, { activityId, accepted: true });

    expect(result.ok).toBe(true);
    expect(mocks.upsertAcceptanceAndTasks).toHaveBeenCalledWith(
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
    expect(mocks.upsertAcceptanceAndTasks).toHaveBeenCalledWith(
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
    expect(mocks.upsertAcceptanceAndTasks).not.toHaveBeenCalled();
  });

  it("rejeita FORBIDDEN quando o creator tenta responder", async () => {
    mocks.findActivityById.mockResolvedValue(sharedActivity);

    const result = await respondSharedActivity(creator.id, { activityId, accepted: true });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
  });

  it("permite Free aceitar compartilhada quando é membro", async () => {
    mocks.findActivityById.mockResolvedValue(sharedActivity);
    mocks.hasProSubscription.mockResolvedValue(false);

    const result = await respondSharedActivity(other.id, { activityId, accepted: true });

    expect(result.ok).toBe(true);
    expect(mocks.userHasActiveProfileInTurma).toHaveBeenCalledWith(other.id, turmaId);
    expect(mocks.upsertAcceptanceAndTasks).toHaveBeenCalledWith(
      activityId,
      other.id,
      true,
      turmaId,
    );
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
    expect(mocks.upsertAcceptanceAndTasks).not.toHaveBeenCalled();
  });
});

describe("shared activity corrections (creator vs acceptor)", () => {
  const sharedActivity = {
    ...baseActivity,
    visibility: "shared_with_turma" as const,
  };

  it("aceite mantém permissão do criador para corrigir e cancelar", async () => {
    // 1. Creator cria atividade shared (Pro path, sem helper de free limit)
    mocks.findTurmaWithSchoolById.mockResolvedValue(baseTurma);
    mocks.subjectBelongsToTurma.mockResolvedValue(true);
    mocks.hasProSubscription.mockResolvedValue(true);
    mocks.insertActivityWithTasks.mockResolvedValue(sharedActivity);

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
    expect(mocks.upsertAcceptanceAndTasks).toHaveBeenCalledWith(
      activityId,
      other.id,
      true,
      turmaId,
    );

    // 3. Criador pode corrigir; versionamento é responsabilidade do repositório.
    mocks.findActivityById.mockResolvedValue(sharedActivity);
    mocks.hasOtherAcceptances.mockResolvedValue(true);
    mocks.updateActivityById.mockResolvedValue(sharedActivity);
    mocks.deleteActivityById.mockResolvedValue(true);

    const updateAttempt = await updateActivity(creator.id, {
      version: 1,
      id: activityId,
      subjectId,
      type: "task",
      title: "Prazo retificado pela escola",
      description: undefined,
      dueAt: "2026-06-05",
      visibility: "shared_with_turma",
    });
    expect(updateAttempt.ok).toBe(true);
    expect(mocks.updateActivityById).toHaveBeenCalledWith(
      activityId,
      expect.objectContaining({ dueAt: "2026-06-05" }),
      creator.id,
      1,
    );

    // 4. O repositório preserva o registro ao cancelar.
    const deleteAttempt = await deleteActivity(creator.id, { id: activityId });
    expect(deleteAttempt.ok).toBe(true);
    expect(mocks.deleteActivityById).toHaveBeenCalledWith(activityId, creator.id);
  });

  it("acceptor não consegue editar/deletar (FORBIDDEN), independente de acceptance", async () => {
    // Edit pela acceptor sempre falha (não é creator).
    mocks.findActivityById.mockResolvedValue(sharedActivity);

    const updateAttempt = await updateActivity(other.id, {
      version: 1,
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
