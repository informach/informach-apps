import { z } from "zod";
import { CHAINS, EDIBODY_CHAINS, EXERCISES } from "@/features/treino/catalog/catalog";
import type { ProgressMap } from "@/features/treino/engine/progression";
import { setLogSchema } from "./schema";

/**
 * Backup JSON do EdiBody (o app que deu origem ao Bora Treinar). Perfis e
 * sessões ficavam no aparelho; aqui viram dados da conta. Campos desconhecidos
 * são ignorados e logs de exercícios que não existem mais ficam de fora.
 */
const backupSchema = z.object({
  app: z.literal("edibody"),
  profiles: z
    .array(
      z.object({
        id: z.number(),
        name: z.string().trim().min(1).max(24),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
        progress: z
          .record(
            z.string(),
            z.object({
              level: z.number().int().min(0),
              bonus: z.number().int().min(0),
              streak: z.number().int().min(0),
            }),
          )
          .default({}),
      }),
    )
    .max(20),
  sessions: z
    .array(
      z.object({
        profileId: z.number(),
        workoutId: z.string().max(80),
        startedAt: z.number().int().positive(),
        duration: z.number().int().min(0).max(14400),
        mode: z.enum(["camera", "manual"]),
        logs: z.array(z.unknown()).max(300),
      }),
    )
    .max(5000),
});

export interface ImportedProfile {
  sourceId: number;
  name: string;
  color: string;
  progress: ProgressMap;
  sessions: {
    workoutRef: string;
    workoutName: string;
    startedAt: number;
    durationSeconds: number;
    mode: "camera" | "manual";
    logs: z.infer<typeof setLogSchema>[];
  }[];
}

/** Nível do EdiBody (índice na trilha antiga) convertido para a trilha nova pelo exercício. */
function convertProgress(old: Record<string, { level: number; bonus: number; streak: number }>) {
  const progress: ProgressMap = {};
  for (const [oldChain, levels] of Object.entries(EDIBODY_CHAINS)) {
    const st = old[oldChain];
    if (!st) continue;
    const exerciseId = levels[Math.min(st.level, levels.length - 1)];
    const chain = exerciseId && CHAINS.find((c) => c.levels.includes(exerciseId));
    if (!exerciseId || !chain) continue;
    progress[chain.id] = { level: chain.levels.indexOf(exerciseId), bonus: st.bonus, streak: 0 };
  }
  return progress;
}

const catalogName = (workoutId: string) =>
  workoutId.startsWith("pratica:")
    ? `Prática: ${EXERCISES.find((e) => `pratica:${e.id}` === workoutId)?.name ?? "exercício"}`
    : `EdiBody: ${workoutId}`;

export function parseEdibodyBackup(json: unknown): ImportedProfile[] {
  const data = backupSchema.parse(json);
  return data.profiles.map((p) => ({
    sourceId: p.id,
    name: p.name,
    color: p.color.toUpperCase(),
    progress: convertProgress(p.progress),
    sessions: data.sessions
      .filter((s) => s.profileId === p.id)
      .map((s) => ({
        workoutRef: s.workoutId.startsWith("pratica:") ? s.workoutId : "importado:edibody",
        workoutName: catalogName(s.workoutId),
        startedAt: s.startedAt,
        durationSeconds: s.duration,
        mode: s.mode,
        logs: s.logs.flatMap((l) => {
          const parsed = setLogSchema.safeParse(l);
          return parsed.success ? [parsed.data] : [];
        }),
      }))
      .filter((s) => s.logs.length > 0),
  }));
}
