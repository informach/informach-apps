"use client";
import Link from "next/link";
import { useState } from "react";
import { fmtTime } from "@/components/avatar";
import type { SessionInput } from "@/features/sessoes/schema";
import { exerciseById } from "@/features/treino/catalog/catalog";
import type { Workout } from "@/features/treino/catalog/workouts";
import { PlayerLoader } from "@/features/treino/telas/player-loader";

const PERFIL = { id: "00000000-0000-4000-8000-000000000000", name: "Teste", color: "#C8FF2E" };

/**
 * O player do app com um perfil de mentira. No fim, em vez de salvar, mostra
 * o que teria sido gravado: repetições, parciais e tempos de cada série.
 */
export function JogadorPlayground({
  workout,
  practiceExerciseId,
  workoutRef,
  workoutName,
  mode,
}: {
  workout: Workout | null;
  practiceExerciseId: string | null;
  workoutRef: string;
  workoutName: string;
  mode: "camera" | "manual";
}) {
  const [resultado, setResultado] = useState<SessionInput | null>(null);
  const [rodada, setRodada] = useState(0);

  if (!resultado)
    return (
      <PlayerLoader
        key={rodada}
        profile={PERFIL}
        workout={workout}
        practiceExerciseId={practiceExerciseId}
        workoutRef={workoutRef}
        workoutName={workoutName}
        mode={mode}
        levels={{}}
        onFinish={setResultado}
      />
    );

  const reps = resultado.logs.reduce((t, l) => t + l.reps, 0);
  const parciais = resultado.logs.reduce((t, l) => t + l.partials, 0);
  return (
    <div className="screen">
      <main className="scroll playground" id="conteudo">
        <div className="section-title first">
          <h2>{workoutName}</h2>
          <span className="muted">resultado do playground, não foi salvo</span>
        </div>
        <div className="stats-row">
          <div className="stat">
            <span className="label">repetições</span>
            <span className="value num">{reps}</span>
          </div>
          <div className="stat">
            <span className="label">parciais</span>
            <span className="value num">{parciais}</span>
          </div>
          <div className="stat">
            <span className="label">duração</span>
            <span className="value num">{fmtTime(resultado.durationSeconds)}</span>
          </div>
          <div className="stat">
            <span className="label">contagem</span>
            <span className="value num">{resultado.mode === "camera" ? "Câmera" : "Manual"}</span>
          </div>
        </div>
        <div className="card lab-table spaced">
          <table>
            <thead>
              <tr>
                <th>Série</th>
                <th>Exercício</th>
                <th>Meta</th>
                <th>Feitas</th>
                <th>Parciais</th>
                <th>Avisos</th>
              </tr>
            </thead>
            <tbody>
              {resultado.logs.map((l, i) => {
                const ex = exerciseById(l.exerciseId);
                const hold = l.kind === "hold";
                return (
                  // biome-ignore lint/suspicious/noArrayIndexKey: as séries não mudam de ordem
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td>{ex.name}</td>
                    <td>{l.target ? `${l.target}${hold ? " s" : ""}` : "livre"}</td>
                    <td>{hold ? `${l.holdSeconds} s` : l.reps}</td>
                    <td>{hold ? "–" : l.partials}</td>
                    <td>
                      {Object.entries(l.issues)
                        .map(([cue, n]) => `${cue} (${n})`)
                        .join(", ") || "–"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="row spaced">
          <button
            type="button"
            className="btn primary"
            onClick={() => {
              setResultado(null);
              setRodada((n) => n + 1);
            }}
          >
            Treinar de novo
          </button>
          <Link className="btn ghost" href="/dev/playground">
            Voltar ao playground
          </Link>
        </div>
      </main>
    </div>
  );
}
