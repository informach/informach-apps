import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar, fmtTime } from "@/components/avatar";
import { currentTrainer } from "@/features/familia/view";
import { sessoesDoGrupo } from "@/features/sessoes/repository";

export const metadata = { title: "Treino junto" };

const SENSACAO = { facil: "achou fácil", na_medida: "achou na medida", dificil: "achou difícil" };

/** Resumo de treinar junto: cada pessoa com o seu treino, sem placar entre elas. */
export default async function ResumoDoGrupo({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { user, profiles } = await currentTrainer();
  const sessoes = await sessoesDoGrupo(user.id, id);
  if (!sessoes.length) notFound();
  const primeira = sessoes[0];
  return (
    <div className="screen">
      <main className="scroll narrow" id="conteudo">
        <div className="summary">
          <div className="summary-hero">
            <span className="muted">{primeira?.workoutName}</span>
            <h1>Treinaram juntos!</h1>
            <p className="muted">
              {fmtTime(primeira?.duration ?? 0)} · cada treino ficou salvo no perfil de cada um
            </p>
          </div>
          <div className="stack">
            {sessoes.map((s) => {
              const p = profiles.find((x) => x.id === s.profileId);
              const reps = s.logs.reduce((t, l) => t + l.reps, 0);
              return (
                <Link key={s.id} href={`/resumo/${s.id}`} className="card suggestion">
                  {p && <Avatar profile={p} size="2.5rem" />}
                  <span className="grow">
                    <strong>{p?.name ?? "Perfil"}</strong>
                    <small className="muted block-line">
                      {s.logs.length} séries · {reps} repetições
                      {s.feeling ? ` · ${SENSACAO[s.feeling]}` : ""}
                    </small>
                  </span>
                  <span className="chip">Ver</span>
                </Link>
              );
            })}
          </div>
          <div className="center-row">
            <Link href="/perfis" className="btn primary big" data-autofocus>
              Voltar aos perfis
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
