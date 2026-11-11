import { progressOf } from "@/features/familia/repository";
import { requireTrainer } from "@/features/familia/view";
import { LibraryScreen } from "@/features/treino/telas/exercicios";

export const metadata = { title: "Exercícios" };

export default async function Exercicios() {
  const { user, profile } = await requireTrainer();
  return <LibraryScreen profile={profile} progress={await progressOf(user.id, profile.id)} />;
}
