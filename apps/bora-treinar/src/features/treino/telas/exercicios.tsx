"use client";
import { ArrowLeft, Camera, Hand, Lock } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { TopNav } from "@/components/top-nav";
import { cadenceLabel } from "../body/cadence";
import { CHAINS, exerciseById, type View } from "../catalog/catalog";
import type { ProgressMap } from "../engine/progression";
import { unlockAudio } from "../engine/voice";
import { Instructor3D } from "../instructor/instructor-3d";

const VIEWS: [View, string][] = [
  ["front", "Frente"],
  ["side", "Lado"],
  ["three4", "3/4"],
];

const EQUIPMENT: Record<string, string> = {
  apoio: "Precisa de um apoio firme: sofá, cadeira encostada na parede ou degrau",
  parede: "Precisa de uma parede livre",
};

export const playerHref = (ref: string, mode: "camera" | "manual") =>
  `/treinar?ref=${encodeURIComponent(ref)}&modo=${mode}`;

export function LibraryScreen({
  profile,
  progress,
}: {
  profile: { name: string; color: string };
  progress: ProgressMap;
}) {
  return (
    <div className="screen">
      <TopNav profile={profile} />
      <main className="scroll" id="conteudo">
        {CHAINS.map((c, ci) => {
          const level = progress[c.id]?.level ?? 0;
          return (
            <section key={c.id}>
              <div className={`section-title ${ci === 0 ? "first" : ""}`}>
                <h2>{c.name}</h2>
                {c.levels.length > 1 && (
                  <span className="muted">progressão em {c.levels.length} níveis</span>
                )}
              </div>
              <div className="grid">
                {c.levels.map((id, i) => {
                  const ex = exerciseById(id);
                  const tag =
                    i === level
                      ? "Seu nível"
                      : i < level
                        ? "Concluído"
                        : c.levels.length > 1
                          ? `Nível ${i + 1}`
                          : null;
                  return (
                    <Link
                      key={id}
                      href={`/exercicios/${id}`}
                      className="card ex-card"
                      data-autofocus={ci === 0 && i === 0 ? true : undefined}
                    >
                      <h3>{ex.name}</h3>
                      <span className="muted">{ex.cue}</span>
                      <span className="muscles">{ex.muscles.join(" · ")}</span>
                      {tag && (
                        <span className={`chip level-tag ${i === level ? "current" : ""}`}>
                          {tag}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </section>
          );
        })}
      </main>
    </div>
  );
}

export function ExerciseScreen({
  id,
  best,
  cameraAllowed,
}: {
  id: string;
  best: number;
  cameraAllowed: boolean;
}) {
  const router = useRouter();
  const ex = exerciseById(id);
  const [view, setView] = useState<View>(ex.view);
  const hold = ex.rule.kind === "hold";

  const practice = (mode: "camera" | "manual") => {
    unlockAudio();
    router.push(playerHref(`pratica:${id}`, mode));
  };

  return (
    <div className="screen">
      <header className="topbar">
        <button
          type="button"
          className="icon-btn"
          onClick={() => router.back()}
          aria-label="Voltar"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="page-title">{ex.name}</h1>
      </header>
      <main className="scroll" id="conteudo">
        <div className="exercise-layout">
          <div className="stage3d">
            <Instructor3D
              className="canvas"
              exerciseId={id}
              mode={hold ? "hold" : "cadence"}
              view={view}
            />
            <div className="view-toggle stage-corner">
              {VIEWS.map(([v, l]) => (
                <button type="button" key={v} aria-pressed={view === v} onClick={() => setView(v)}>
                  {l}
                </button>
              ))}
            </div>
            <span className="pill stage-foot">
              Arraste para girar · {hold ? "isometria" : `cadência ${cadenceLabel(ex.cadence)} s`}
            </span>
          </div>
          <div className="info-list">
            <div className="card">
              <p className="lead">{ex.cue}</p>
              <p className="muted spaced">{ex.muscles.join(" · ")}</p>
              {ex.equipment !== "chão" && <p className="muted spaced">{EQUIPMENT[ex.equipment]}</p>}
            </div>
            <div className="card">
              <strong>Erros comuns</strong>
              <ul>
                {ex.mistakes.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </div>
            <div className="card">
              <strong>Câmera</strong>
              <p className="muted spaced">{ex.cameraHint}</p>
              {ex.alternating && (
                <p className="muted spaced">
                  Cada lado conta uma repetição: esquerda, direita, esquerda…
                </p>
              )}
            </div>
            {best > 0 && (
              <div className="stat">
                <span className="label">Seu recorde</span>
                <span className="value num">
                  {best}
                  <small>{hold ? "s" : "repetições"}</small>
                </span>
              </div>
            )}
            <div className="row">
              {cameraAllowed ? (
                <button
                  type="button"
                  className="btn primary"
                  data-autofocus
                  onClick={() => practice("camera")}
                >
                  <Camera size={18} /> Praticar com câmera
                </button>
              ) : (
                <Link href="/conta" className="btn ghost">
                  <Lock size={18} /> Câmera na assinatura
                </Link>
              )}
              <button
                type="button"
                className={`btn ${cameraAllowed ? "" : "primary"}`}
                data-autofocus={cameraAllowed ? undefined : true}
                onClick={() => practice("manual")}
              >
                <Hand size={18} /> Praticar sem câmera
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
