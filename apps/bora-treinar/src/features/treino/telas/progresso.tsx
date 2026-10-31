"use client";
import { Award, Download, Lock } from "lucide-react";
import Link from "next/link";
import { fmtTime } from "@/components/avatar";
import { TopNav } from "@/components/top-nav";
import type { Conquista } from "@/features/conquistas/catalogo";
import { CHAINS, exerciseById } from "../catalog/catalog";
import { type ProgressMap, pendingSuggestions, SESSIONS_TO_ADVANCE } from "../engine/progression";
import { records, type SessionLike, streakDays, weeklyReps } from "../engine/stats";

const dateFmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" });
const dayFmt = new Intl.DateTimeFormat("pt-BR", {
  weekday: "short",
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});
const MODE_LABEL = { camera: "Câmera", manual: "Manual", pareado: "Celular" } as const;

function WeeklyChart({ weeks }: { weeks: ReturnType<typeof weeklyReps> }) {
  const max = Math.max(1, ...weeks.map((w) => w.reps));
  const peak = weeks.reduce((b, w, i) => (w.reps > (weeks[b]?.reps ?? 0) ? i : b), 0);
  return (
    <div
      className="chart"
      role="img"
      aria-label={`Repetições por semana: ${weeks.map((w) => `${dateFmt.format(w.from)} ${w.reps}`).join(", ")}`}
    >
      {weeks.map((w, i) => {
        const current = i === weeks.length - 1;
        // rótulos só na semana atual e no pico, para não poluir
        const label = (current || i === peak) && w.reps > 0;
        return (
          <div
            className="col"
            key={w.from}
            title={`Semana de ${dateFmt.format(w.from)}: ${w.reps} repetições em ${w.sessions} treino(s), ${w.minutes} min`}
          >
            <div
              className={`bar ${current ? "current" : ""}`}
              style={{ height: `${(w.reps / max) * 100}%` }}
            >
              {label && <span>{w.reps}</span>}
            </div>
            <span className="tick">{current ? "Esta" : dateFmt.format(w.from)}</span>
          </div>
        );
      })}
    </div>
  );
}

type Sessao = SessionLike & {
  id: string;
  workoutName: string;
  mode: "camera" | "manual" | "pareado";
};

export function ProgressScreen({
  profile,
  sessions,
  progress,
  achievements,
  allAchievements,
  paid,
  historyLimit,
}: {
  profile: { name: string; color: string };
  sessions: Sessao[];
  progress: ProgressMap;
  achievements: string[];
  allAchievements: Conquista[];
  paid: boolean;
  historyLimit: number;
}) {
  const recs = records(sessions);
  const totalReps = sessions.reduce((t, s) => t + s.logs.reduce((u, l) => u + l.reps, 0), 0);
  const minutes = Math.round(sessions.reduce((t, s) => t + s.duration, 0) / 60);
  const pending = new Set(pendingSuggestions(progress).map((s) => s.chainId));
  const history = [...sessions].reverse();

  return (
    <div className="screen">
      <TopNav profile={profile} />
      <main className="scroll" id="conteudo">
        <div className="stat-stack wide">
          <div className="stat">
            <span className="label">Treinos</span>
            <span className="value num">{sessions.length}</span>
          </div>
          <div className="stat">
            <span className="label">Repetições</span>
            <span className="value num">{totalReps}</span>
          </div>
          <div className="stat">
            <span className="label">Minutos treinados</span>
            <span className="value num">{minutes}</span>
          </div>
          <div className="stat">
            <span className="label">Sequência</span>
            <span className="value num">
              {streakDays(sessions)}
              <small>dias</small>
            </span>
          </div>
        </div>

        <div className="section-title">
          <h2>Repetições por semana</h2>
          <span className="muted">últimas 8 semanas</span>
        </div>
        <div className="card">
          <WeeklyChart weeks={weeklyReps(sessions, 8)} />
        </div>

        <div className="section-title">
          <h2>Conquistas</h2>
          <span className="muted">
            {achievements.length} de {allAchievements.length}
          </span>
        </div>
        <div className="badges">
          {allAchievements.map((a) => {
            const on = achievements.includes(a.id);
            return (
              <div className={`card badge ${on ? "" : "off"}`} key={a.id}>
                <Award size={26} />
                <strong>{a.nome}</strong>
                <span className="muted">{a.descricao}</span>
              </div>
            );
          })}
        </div>

        <div className="section-title">
          <h2>Recordes</h2>
        </div>
        {recs.length ? (
          <div className="card">
            {recs.map((r) => {
              const hold = exerciseById(r.exerciseId).rule.kind === "hold";
              return (
                <div className="record-row" key={r.exerciseId}>
                  <span>
                    <strong>{exerciseById(r.exerciseId).name}</strong>
                    <span className="muted">
                      {" "}
                      · {hold ? `${r.sets} séries` : `${r.totalReps} repetições no total`}
                    </span>
                  </span>
                  <span className="value">{hold ? `${r.bestHold} s` : `${r.bestSet} rep.`}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="card empty">Faça o primeiro treino para ver seus recordes aqui.</div>
        )}

        <div className="section-title">
          <h2>Níveis</h2>
          {!paid && <span className="muted">subir de nível é da assinatura</span>}
        </div>
        <div className="levels">
          {CHAINS.map((c) => {
            const st = progress[c.id] ?? { level: 0, bonus: 0, streak: 0 };
            const level = Math.min(st.level, c.levels.length - 1);
            return (
              <div className="card level-card" key={c.id}>
                <span className="muted">{c.name}</span>
                <h3 className="level-name">{exerciseById(c.levels[level] ?? "").name}</h3>
                <span className="muted">
                  {pending.has(c.id)
                    ? "Pronto para evoluir: aceite no resumo do próximo treino"
                    : st.streak > 0
                      ? `${st.streak} de ${SESSIONS_TO_ADVANCE} sessões para evoluir`
                      : "Bata a meta em todas as séries"}
                </span>
                <div className="track">
                  {c.levels.map((l, i) => (
                    <span key={l} className={i <= level ? "on" : ""} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="section-title">
          <h2>Histórico</h2>
          {!paid && history.length > historyLimit && (
            <span className="muted">últimos {historyLimit} no plano gratuito</span>
          )}
        </div>
        {history.length ? (
          <div className="card list-card">
            {history.slice(0, historyLimit).map((s) => (
              <Link className="history-row" key={s.id} href={`/resumo/${s.id}`}>
                <span className="grow">
                  <strong>{s.workoutName}</strong>
                  <br />
                  <span className="muted">{dayFmt.format(s.startedAt)}</span>
                </span>
                <span className="chip">{MODE_LABEL[s.mode]}</span>
                <span className="num cell-reps">{s.logs.reduce((t, l) => t + l.reps, 0)} rep.</span>
                <span className="muted cell-time">{fmtTime(s.duration)}</span>
              </Link>
            ))}
            {!paid && history.length > historyLimit && (
              <Link className="history-row" href="/conta">
                <Lock size={16} /> Ver o histórico completo com a assinatura
              </Link>
            )}
          </div>
        ) : (
          <div className="card empty">Nenhum treino ainda.</div>
        )}

        <div className="section-title">
          <h2>Seus dados</h2>
          <span className="muted">ficam guardados na sua conta, em qualquer aparelho</span>
        </div>
        <div className="row">
          <a className="btn" href="/api/conta/exportar">
            <Download size={18} /> Exportar dados da família
          </a>
          <Link href="/conta#edibody" className="btn ghost">
            Trazer um backup do EdiBody
          </Link>
        </div>
      </main>
    </div>
  );
}
