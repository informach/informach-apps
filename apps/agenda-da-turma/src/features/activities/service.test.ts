import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { respondSharedActivity } from "./service";

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
}));

const creator = { id: "user_creator" };
const other = { id: "user_other" };
const turmaId = "turma_1";
const subjectId = "subj_1";
const activityId = "activity_1";

const _baseTurma = {
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

const _createInput = {
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
