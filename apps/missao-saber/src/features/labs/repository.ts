import "server-only";
import { isDeepStrictEqual } from "node:util";
import { and, db, eq } from "@informach/db";
import { missaoExperiments, missaoProfiles } from "@informach/db/schema";
import { assertAllowed } from "@/lib/errors";
import { lockOwner } from "../learning/repository";
import { type Experiment, experimentSchema, type SavedExperiment } from "./schemas";

export async function getExperiments(userId: string, profileId: string) {
  const rows = await db
    .select({ experiment: missaoExperiments })
    .from(missaoExperiments)
    .innerJoin(missaoProfiles, eq(missaoExperiments.profileId, missaoProfiles.id))
    .where(and(eq(missaoProfiles.userId, userId), eq(missaoProfiles.id, profileId)));
  return Object.fromEntries(
    rows.map(({ experiment }) => [
      experiment.kind,
      { state: experimentSchema.parse(experiment.state), revision: experiment.revision },
    ]),
  ) as Partial<Record<Experiment["kind"], SavedExperiment>>;
}
export async function saveExperiment(
  userId: string,
  profileId: string,
  state: Experiment,
  revision: number,
) {
  return db.transaction(async (tx) => {
    await lockOwner(tx, userId);
    const [profile] = await tx
      .select({ id: missaoProfiles.id })
      .from(missaoProfiles)
      .where(and(eq(missaoProfiles.userId, userId), eq(missaoProfiles.id, profileId)));
    assertAllowed(profile, "PROFILE", "Perfil não encontrado.");
    const [existing] = await tx
      .select()
      .from(missaoExperiments)
      .where(
        and(eq(missaoExperiments.profileId, profileId), eq(missaoExperiments.kind, state.kind)),
      );
    if (existing && isDeepStrictEqual(existing.state, state) && existing.revision === revision + 1)
      return existing.revision;
    assertAllowed(
      (existing?.revision ?? 0) === revision,
      "CONFLICT",
      "Este experimento foi atualizado em outra aba. Recarregue para ver a versão salva antes de editar.",
    );
    await tx
      .insert(missaoExperiments)
      .values({ profileId, kind: state.kind, state, revision: revision + 1 })
      .onConflictDoUpdate({
        target: [missaoExperiments.profileId, missaoExperiments.kind],
        set: { state, revision: revision + 1, updatedAt: new Date() },
      });
    return revision + 1;
  });
}
