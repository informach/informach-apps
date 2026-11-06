import { progressOf } from "@/features/familia/repository";
import { requireTrainer } from "@/features/familia/view";
import { sessionsOf } from "@/features/sessoes/repository";
import { workoutCards } from "@/features/treino/dados";
import { HomeScreen } from "@/features/treino/telas/inicio";
import { FUSO_PADRAO } from "@/lib/datas";

export const metadata = { title: "Início" };

export default async function Inicio() {
  const { user, profile, access, family } = await requireTrainer();
  const [sessions, progress, workouts] = await Promise.all([
    sessionsOf(profile.id, { since: new Date(Date.now() - 400 * 86_400_000) }),
    progressOf(profile.id),
    workoutCards(user.id, access),
  ]);
  return (
    <HomeScreen
      profile={profile}
      sessions={sessions}
      progress={progress}
      workouts={workouts}
      paid={access.unlocked}
      fuso={family?.timezone ?? FUSO_PADRAO}
    />
  );
}
