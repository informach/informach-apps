"use client";
import { Clock, Flame, Lock, Play, Plus, Repeat, Trophy } from "lucide-react";
import Link from "next/link";
import { TopNav } from "@/components/top-nav";
import { CHAINS, exerciseById } from "../catalog/catalog";
import { estimateMinutes, type Workout } from "../catalog/workouts";
import type { ProgressMap } from "../engine/progression";
import { type SessionLike, streakDays, weeklyReps } from "../engine/stats";
import { Instructor3D } from "../instructor/instructor-3d";

export type WorkoutCard = Workout & { ref: string; locked: boolean };

export const workoutHref = (ref: string) => `/treino?ref=${encodeURIComponent(ref)}`;

/** Sugere o próximo treino: o primeiro para quem está começando, depois alterna foco. */
function recommend(sessions: { workoutRef: string }[], workouts: WorkoutCard[]) {
  const open = workouts.filter((w) => !w.locked && w.ref.startsWith("catalogo:"));
  const first = open[0] ?? workouts[0];
  if (!sessions.length || open.length < 2) return first;
  const order = [
    "aquecimento-5",
    "primeiro-treino",
    "core-rapido",
    "corpo-todo",
    "cardio-sem-pulo",
    "pernas-gluteos",
    "tabata-pernas",
    "core-10",
    "emom-6",
    "isometria-total",
    "hiit-12",
    "amrap-8",
    "forca-avancada",
    "emom-10",
  ];
  const beginner = sessions.length < 3;
  const pool = (beginner ? ["primeiro-treino", "core-rapido", "aquecimento-5"] : order).filter(
    (id) => open.some((w) => w.id === id),
  );
  const last = sessions[sessions.length - 1]?.workoutRef.replace("catalogo:", "") ?? "";
  const next = pool[(pool.indexOf(last) + 1) % pool.length] ?? pool[0];
  return open.find((w) => w.id === next) ?? first;
}

export function HomeScreen({
  profile,
  sessions,
  progress,
  workouts,
  paid,
}: {
  profile: { name: string; color: string };
  sessions: (SessionLike & { workoutRef: string })[];
  progress: ProgressMap;
  workouts: WorkoutCard[];
  paid: boolean;
}) {
  const rec = recommend(sessions, workouts);
  const week = weeklyReps(sessions, 1)[0] ?? { reps: 0, minutes: 0 };
  const streak = streakDays(sessions);
  const firstName = profile.name.split(" ")[0];
  const mine = workouts.filter((w) => w.ref.startsWith("meu:"));
  const catalog = workouts.filter((w) => w.ref.startsWith("catalogo:"));

  return (
    <div className="screen">
      <TopNav profile={profile} />
      <main className="scroll" id="conteudo">
        <section className="hero">
          <div className="hero-main">
            <Instructor3D
              className="hero-figure"
              exerciseId="agachamento"
              mode="cadence"
              view="three4"
            />
            <span className="eyebrow">Treino de hoje · {firstName}</span>
            {rec && (
              <>
                <h1>{rec.name}</h1>
                <div className="meta">
                  <span>{rec.subtitle}</span>
                  <span>~{estimateMinutes(rec)} min</span>
                </div>
                <Link href={workoutHref(rec.ref)} className="btn big" data-autofocus>
                  <Play size={20} fill="currentColor" /> Começar
                </Link>
              </>
            )}
          </div>
          <div className="stat-stack">
            <div className="stat">
              <span className="label">
                <Flame size={16} /> Sequência
              </span>
              <span className="value num">
                {streak}
                <small>{streak === 1 ? "dia" : "dias"}</small>
              </span>
            </div>
            <div className="stat">
              <span className="label">
                <Repeat size={16} /> Repetições na semana
              </span>
              <span className="value num">{week.reps}</span>
            </div>
            <div className="stat">
              <span className="label">
                <Trophy size={16} /> Treinos feitos
              </span>
              <span className="value num">{sessions.length}</span>
            </div>
            <div className="stat">
              <span className="label">
                <Clock size={16} /> Minutos na semana
              </span>
              <span className="value num">{week.minutes}</span>
            </div>
          </div>
        </section>

        {!paid && (
          <Link href="/conta" className="card upsell">
            <strong>Você está no plano gratuito.</strong>
            <span className="muted">
              Assine para liberar todos os treinos, a contagem pela câmera, os níveis, os desafios
              em família e o celular como câmera da TV.
            </span>
          </Link>
        )}

        <div className="section-title">
          <h2>Meus treinos</h2>
          {paid ? (
            <Link href="/meus-treinos/novo" className="chip">
              <Plus size={16} /> Montar treino
            </Link>
          ) : (
            <span className="muted">na assinatura</span>
          )}
        </div>
        {mine.length ? (
          <div className="grid">
            {mine.map((w) => (
              <WorkoutTile key={w.ref} w={w} />
            ))}
          </div>
        ) : (
          <Link href={paid ? "/meus-treinos/novo" : "/conta"} className="card empty">
            Monte um treino do seu jeito, com séries, Tabata, EMOM ou AMRAP.
          </Link>
        )}

        <div className="section-title">
          <h2>Treinos</h2>
          <span className="muted">{catalog.length} prontos</span>
        </div>
        <div className="grid">
          {catalog.map((w) => (
            <WorkoutTile key={w.ref} w={w} />
          ))}
        </div>

        <div className="section-title">
          <h2>Seus níveis</h2>
          <span className="muted">avançam quando você bate as metas</span>
        </div>
        <div className="levels">
          {CHAINS.map((c) => {
            const st = progress[c.id] ?? { level: 0, bonus: 0 };
            const exId = c.levels[Math.min(st.level, c.levels.length - 1)] ?? c.levels[0] ?? "";
            const ex = exerciseById(exId);
            const unit = ex.rule.kind === "hold" ? "s" : " rep.";
            return (
              <Link key={c.id} href={`/exercicios/${ex.id}`} className="card level-card">
                <span className="muted">{c.name}</span>
                <h3 className="level-name">{ex.name}</h3>
                {st.bonus > 0 && (
                  <span className="muted">
                    {" "}
                    +{st.bonus}
                    {unit} na meta
                  </span>
                )}
                <div className="track">
                  {c.levels.map((l, i) => (
                    <span key={l} className={i <= st.level ? "on" : ""} />
                  ))}
                </div>
              </Link>
            );
          })}
        </div>
      </main>
    </div>
  );
}

function WorkoutTile({ w }: { w: WorkoutCard }) {
  return (
    <Link href={w.locked ? "/conta" : workoutHref(w.ref)} className="card workout-card">
      <span className="muted">{w.focus}</span>
      <h3>{w.name}</h3>
      <p className="muted">{w.subtitle}</p>
      <span className="tags">
        <span className="chip">{w.level}</span>
        <span className="chip">~{estimateMinutes(w)} min</span>
        {w.locked && (
          <span className="chip">
            <Lock size={14} /> Assinatura
          </span>
        )}
      </span>
    </Link>
  );
}
