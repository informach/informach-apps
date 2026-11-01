import { Camera, FlaskConical, Hand } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CHAINS, exerciseById } from "@/features/treino/catalog/catalog";
import { WORKOUTS } from "@/features/treino/catalog/workouts";

export const metadata = { title: "Playground (desenvolvimento)" };

const treinar = (ref: string, modo: "camera" | "manual") =>
  `/dev/playground/treino?ref=${encodeURIComponent(ref)}&modo=${modo}`;

/**
 * Só em desenvolvimento: tudo o que o app tem de treino, sem conta, sem
 * assinatura e sem banco. Nada do que acontece aqui é salvo.
 */
export default function Playground() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <div className="screen">
      <main className="scroll playground" id="conteudo">
        <div className="section-title first">
          <h2>Playground</h2>
          <span className="muted">sem conta, sem assinatura, nada é salvo</span>
        </div>
        <p className="muted">
          O laboratório mostra o que a câmera mede em cada exercício e deixa ajustar os limiares ao
          vivo. Os treinos abrem o player de verdade, com câmera ou contagem manual, e no fim
          mostram o resultado aqui mesmo.
        </p>

        {CHAINS.map((c) => (
          <section key={c.id}>
            <div className="section-title">
              <h2>{c.name}</h2>
            </div>
            <div className="grid">
              {c.levels.map((id) => {
                const ex = exerciseById(id);
                const ref = `pratica:${id}`;
                return (
                  <div key={id} className="card ex-card">
                    <h3>{ex.name}</h3>
                    <span className="muted">{ex.cameraHint}</span>
                    <span className="muscles">
                      {ex.rule.kind === "hold" ? "isometria" : "repetições"} ·{" "}
                      {ex.view === "side" ? "de lado" : ex.view === "front" ? "de frente" : "3/4"}
                    </span>
                    <div className="row playground-actions">
                      <Link className="btn primary" href={`/dev/playground/camera?ex=${id}`}>
                        <FlaskConical size={18} /> Laboratório
                      </Link>
                      <Link className="btn" href={treinar(ref, "camera")}>
                        <Camera size={18} /> Praticar
                      </Link>
                      <Link className="btn ghost" href={treinar(ref, "manual")}>
                        <Hand size={18} /> Manual
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}

        <div className="section-title">
          <h2>Treinos prontos</h2>
          <span className="muted">no nível inicial de cada trilha</span>
        </div>
        <div className="grid">
          {WORKOUTS.map((w) => (
            <div key={w.id} className="card ex-card">
              <h3>{w.name}</h3>
              <span className="muted">{w.subtitle}</span>
              <span className="muscles">
                {w.level} · {w.focus}
              </span>
              <div className="row playground-actions">
                <Link className="btn primary" href={treinar(`catalogo:${w.id}`, "camera")}>
                  <Camera size={18} /> Com câmera
                </Link>
                <Link className="btn ghost" href={treinar(`catalogo:${w.id}`, "manual")}>
                  <Hand size={18} /> Manual
                </Link>
              </div>
            </div>
          ))}
        </div>

        <p className="muted spaced">
          Para conferir uma pose parada numa profundidade, use{" "}
          <Link href="/dev/poses?ex=agachamento&d=1">/dev/poses</Link>.
        </p>
      </main>
    </div>
  );
}
