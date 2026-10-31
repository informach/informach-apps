import { Lock, Plus } from "lucide-react";
import Link from "next/link";
import { TopNav } from "@/components/top-nav";
import { canEditWorkouts } from "@/features/acesso/policy";
import { requireTrainer } from "@/features/familia/view";
import { listCustomWorkouts, MAX_CUSTOM_WORKOUTS } from "@/features/meus-treinos/repository";
import { estimateMinutes } from "@/features/treino/catalog/workouts";
import { workoutHref } from "@/features/treino/telas/inicio";

export const metadata = { title: "Meus treinos" };

export default async function MeusTreinos() {
  const { user, profile, access } = await requireTrainer();
  const allowed = canEditWorkouts(access);
  const workouts = allowed ? await listCustomWorkouts(user.id) : [];
  return (
    <div className="screen">
      <TopNav profile={profile} />
      <main className="scroll" id="conteudo">
        <div className="section-title first">
          <h2>Meus treinos</h2>
          {allowed && workouts.length < MAX_CUSTOM_WORKOUTS && (
            <Link href="/meus-treinos/novo" className="btn primary" data-autofocus>
              <Plus size={18} /> Montar treino
            </Link>
          )}
        </div>
        {!allowed ? (
          <Link href="/conta" className="card upsell">
            <strong>
              <Lock size={16} /> Monte treinos do seu jeito com a assinatura.
            </strong>
            <span className="muted">
              Combine séries, Tabata, EMOM e AMRAP com os exercícios do catálogo ou com o nível
              atual de cada pessoa nas trilhas.
            </span>
          </Link>
        ) : workouts.length ? (
          <div className="grid">
            {workouts.map((w) => (
              <Link key={w.id} href={workoutHref(w.id)} className="card workout-card">
                <span className="muted">{w.focus}</span>
                <h3>{w.name}</h3>
                <p className="muted">{w.subtitle}</p>
                <span className="tags">
                  <span className="chip">{w.level}</span>
                  <span className="chip">~{estimateMinutes(w)} min</span>
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="card empty">Nenhum treino montado ainda.</div>
        )}
      </main>
    </div>
  );
}
