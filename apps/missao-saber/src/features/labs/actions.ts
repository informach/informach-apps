"use server";
import { z } from "zod";
import { requireStudyProfile } from "@/features/study-access/server";
import { runAction } from "@/lib/action";
import { saveExperiment } from "./repository";
import { experimentSchema } from "./schemas";

export async function experimentAction(input: unknown) {
  return runAction(async () => {
    const data = z
      .object({
        profileId: z.string().uuid(),
        revision: z.number().int().nonnegative(),
        state: experimentSchema,
      })
      .parse(input);
    return saveExperiment(
      (await requireStudyProfile(data.profileId)).userId,
      data.profileId,
      data.state,
      data.revision,
    );
  });
}
