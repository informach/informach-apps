"use client";
import { Award, Check, Lock, Medal, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { fmtTime } from "@/components/avatar";
import type { Conquista } from "@/features/conquistas/catalogo";
import { acceptSuggestionAction } from "@/features/sessoes/actions";
import { useServerAction } from "@/lib/use-server-action";
import { exerciseById } from "../catalog/catalog";
import { describeSuggestion, type Suggestion } from "../engine/progression";
import type { SetLog } from "../engine/runner";
import { Instructor3D } from "../instructor/instructor-3d";

export function SummaryScreen({
  profileId,
  session,
  records,
  suggestions,
  achievements,
  progressionAllowed,
}: {
  profileId: string;
  session: { workoutName: string; duration: number; logs: SetLog[] };
  records: { exerciseId: string; kind: "reps" | "hold"; value: number }[];
  suggestions: Suggestion[];
  achievements: Conquista[];
  progressionAllowed: boolean;
}) {
  const router = useRouter();
  const [accepted, setAccepted] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState("");
  const [pending, start] = useServerAction();
  const reps = session.logs.reduce((t, l) => t + l.reps, 0);
  const hold = session.logs.reduce((t, l) => t + l.holdSeconds, 0);
  const partials = session.logs.reduce((t, l) => t + l.partials, 0);
  const issues = Object.entries(
    session.logs.reduce<Record<string, number>>((acc, l) => {
      for (const [k, n] of Object.entries(l.issues)) acc[k] = (acc[k] ?? 0) + n;
      return acc;
    }, {}),
  ).sort((a, b) => b[1] - a[1]);

  const accept = (s: Suggestion) =>
    start(async () => {
      const result = await acceptSuggestionAction(profileId, s.chainId);
      if (!result.ok) return setMessage(result.error);
      setAccepted(new Set([...accepted, s.chainId]));
      router.refresh();
    });

  return (
    <div className="screen">
      <main className="scroll" id="conteudo">
        <div className="summary">
          <div className="summary-hero">
            <div className="summary-figure">
              <Instructor3D className="canvas" mode="celebrate" />
            </div>
            <span className="muted">{session.workoutName}</span>
            <h1>Treino concluído!</h1>
          </div>

          <div className="stat-stack">
            <div className="stat">
              <span className="label">Duração</span>
              <span className="value num">{fmtTime(session.duration)}</span>
            </div>
            <div className="stat">
              <span className="label">Repetições</span>
              <span className="value num">{reps}</span>
            </div>
            <div className="stat">
              <span className="label">Séries</span>
              <span className="value num">{session.logs.length}</span>
            </div>
            {hold > 0 && (
              <div className="stat">
                <span className="label">Isometria</span>
                <span className="value num">
                  {hold}
                  <small>s</small>
                </span>
              </div>
            )}
          </div>

          {achievements.length > 0 && (
            <>
              <div className="section-title">
                <h2>
                  <Award size={22} className="title-icon" /> Conquistas novas
                </h2>
              </div>
              <div className="badges">
                {achievements.map((a) => (
                  <div className="card badge" key={a.id}>
                    <Award size={28} />
                    <strong>{a.nome}</strong>
                    <span className="muted">{a.descricao}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {records.length > 0 && (
            <>
              <div className="section-title">
                <h2>
                  <Medal size={22} className="title-icon" /> Novos recordes
                </h2>
              </div>
              <div className="card">
                {records.map((r) => (
                  <div className="record-row" key={r.exerciseId}>
                    <span>{exerciseById(r.exerciseId).name}</span>
                    <span className="value">
                      {r.value}
                      {r.kind === "hold" ? " s" : " rep."}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}

          {suggestions.length > 0 && (
            <>
              <div className="section-title">
                <h2>
                  <TrendingUp size={22} className="title-icon" /> Hora de evoluir
                </h2>
                <span className="muted">você bateu a meta duas vezes seguidas</span>
              </div>
              <div className="stack">
                {suggestions.map((s) => (
                  <div className="card suggestion" key={s.chainId}>
                    <span className="grow">{describeSuggestion(s)}</span>
                    {accepted.has(s.chainId) ? (
                      <span className="chip">
                        <Check size={16} /> Aplicado
                      </span>
                    ) : progressionAllowed ? (
                      <button
                        type="button"
                        className="btn primary"
                        disabled={pending}
                        onClick={() => accept(s)}
                      >
                        Aceitar
                      </button>
                    ) : (
                      <Link href="/conta" className="btn ghost">
                        <Lock size={16} /> Na assinatura
                      </Link>
                    )}
                  </div>
                ))}
              </div>
              <p role="status" className="form-message">
                {message}
              </p>
            </>
          )}

          {(partials > 0 || issues.length > 0) && (
            <>
              <div className="section-title">
                <h2>Execução</h2>
              </div>
              <div className="card">
                {partials > 0 && (
                  <div className="record-row">
                    <span>Repetições parciais (não contaram)</span>
                    <span className="value">{partials}</span>
                  </div>
                )}
                {issues.map(([cue, n]) => (
                  <div className="record-row" key={cue}>
                    <span>{cue}</span>
                    <span className="value">{n}×</span>
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="center-row">
            <Link href="/inicio" className="btn primary big" data-autofocus>
              Voltar ao início
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
