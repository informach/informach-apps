import { notFound } from "next/navigation";
import { EXERCISES } from "@/features/treino/catalog/catalog";
import { Instructor3D } from "@/features/treino/instructor/instructor-3d";

export const metadata = { title: "Poses (desenvolvimento)" };

/**
 * Só em desenvolvimento: mostra o instrutor de um exercício parado numa
 * profundidade, para conferir poses novas (`?ex=flexao-pike&d=0.8`).
 */
export default async function Poses({
  searchParams,
}: {
  searchParams: Promise<{ ex?: string; d?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const { ex, d } = await searchParams;
  const exercise = EXERCISES.find((e) => e.id === ex) ?? EXERCISES[0];
  if (!exercise) notFound();
  const depth = Math.min(1, Math.max(0, Number(d ?? 1)));
  return (
    <main className="stage3d" style={{ height: "100vh", borderRadius: 0 }}>
      <Instructor3D
        className="canvas"
        exerciseId={exercise.id}
        mode={exercise.rule.kind === "hold" ? "hold" : "follow"}
        followDepth={depth}
      />
      <span className="pill stage-foot">
        {exercise.name} · profundidade {depth}
      </span>
    </main>
  );
}
