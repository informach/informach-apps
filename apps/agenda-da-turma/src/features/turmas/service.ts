import "server-only";
import { err, ok } from "@informach/auth/server-actions";
import { FamilyError } from "@informach/family";
import type { AgendaAuthority } from "@/features/family/authority";
import {
  createAndEnroll,
  deleteTurmaMember,
  joinPrivateGroup,
  mutateFreshClass,
  setActiveTurma as setActive,
} from "./mutation-repository";
import { findTurmaByCode, findTurmaWithSchoolById, listTurmasForUser } from "./repository";
import type {
  CreateTurmaInput,
  DeleteTurmaInput,
  JoinByCodeInput,
  LeaveTurmaInput,
  SetActiveTurmaInput,
  UpdateTurmaInput,
} from "./schemas";

async function guarded<T>(work: () => Promise<T>) {
  try {
    return await work();
  } catch (error) {
    if (!(error instanceof FamilyError)) throw error;
    return err({
      code: error.code === "CAPACITY_EXCEEDED" ? "PROFILE_LIMIT_REACHED" : "PROFILE_NOT_FOUND",
    } as const);
  }
}
export const createOrJoinTurma = (actor: AgendaAuthority, input: CreateTurmaInput) =>
  guarded(() => createAndEnroll(actor, input));
export const joinTurmaByCode = (actor: AgendaAuthority, input: JoinByCodeInput) =>
  guarded(() => joinPrivateGroup(actor, input.profileId, input.code));
export const setActiveTurma = (actor: AgendaAuthority, input: SetActiveTurmaInput) =>
  guarded(() => setActive(actor, input.profileId, input.turmaId));
export const leaveTurma = (actor: AgendaAuthority, input: LeaveTurmaInput) =>
  guarded(() => deleteTurmaMember(actor, input.profileId, input.turmaId));
export const listTurmasForCurrentUser = listTurmasForUser;
export const findTurmaForInvite = findTurmaByCode;
export const deleteTurma = (actor: AgendaAuthority, input: DeleteTurmaInput) =>
  guarded(() => mutateFreshClass(actor, input.turmaId));
export const updateTurma = (actor: AgendaAuthority, input: UpdateTurmaInput) =>
  guarded(async () => {
    const result = await mutateFreshClass(actor, input.turmaId, input);
    if (!result.ok) return result;
    const turma = await findTurmaWithSchoolById(actor, input.turmaId);
    return turma ? ok({ turma }) : err({ code: "TURMA_NOT_FOUND" } as const);
  });
