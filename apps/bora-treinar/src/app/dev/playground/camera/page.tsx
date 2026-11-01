import { notFound } from "next/navigation";
import { LaboratorioLoader } from "@/features/playground/laboratorio-loader";
import { EXERCISES } from "@/features/treino/catalog/catalog";

export const metadata = { title: "Laboratório da câmera (playground)" };

/** Só em desenvolvimento: calibração da contagem pela câmera, sem conta e sem salvar nada. */
export default async function LaboratorioCamera({
  searchParams,
}: {
  searchParams: Promise<{ ex?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const { ex } = await searchParams;
  const exercise = EXERCISES.find((e) => e.id === ex) ?? EXERCISES[0];
  if (!exercise) notFound();
  return <LaboratorioLoader exerciseId={exercise.id} />;
}
