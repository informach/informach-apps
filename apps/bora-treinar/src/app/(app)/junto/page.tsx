import { Lock } from "lucide-react";
import { canCountWithCamera } from "@/features/acesso/policy";
import { Cadeado } from "@/features/billing/planos";
import { currentTrainer } from "@/features/familia/view";
import { MIN_JUNTO } from "@/features/sessoes/limits";
import { estimateMinutes, soSeries } from "@/features/treino/catalog/workouts";
import { workoutCards } from "@/features/treino/dados";
import { JuntoScreen } from "@/features/treino/telas/junto";

export const metadata = { title: "Treinar junto" };

export default async function Junto() {
  const { user, profiles, access } = await currentTrainer();
  const perfis = profiles.filter((p) => p.allowed && p.canWrite && p.onboardedAt);
  if (!access.unlocked || perfis.length < MIN_JUNTO)
    return (
      <main className="profiles" id="conteudo">
        <h1>Treinar junto</h1>
        {access.unlocked ? (
          <p className="muted">
            Precisa de pelo menos dois perfis prontos. Crie outro em "Quem vai treinar?".
          </p>
        ) : (
          <Cadeado motivo="perfis" className="btn primary big">
            <Lock size={18} /> Treinar junto faz parte do Compasso
          </Cadeado>
        )}
      </main>
    );
  const cards = await workoutCards(user.id, access);
  return (
    <JuntoScreen
      perfis={perfis.map(({ id, name, color }) => ({ id, name, color }))}
      treinos={cards
        .filter((w) => !w.locked && soSeries(w))
        .map((w) => ({ ref: w.ref, name: w.name, focus: w.focus, minutos: estimateMinutes(w) }))}
      cameraPermitida={canCountWithCamera(access)}
    />
  );
}
