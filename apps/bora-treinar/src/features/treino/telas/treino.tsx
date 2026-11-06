"use client";
import { ArrowLeft, Camera, Hand, Lock, Play, Smartphone } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Avatar } from "@/components/avatar";
import { Cadeado } from "@/features/billing/planos";
import { voltar } from "@/lib/voltar";
import { exerciseById } from "../catalog/catalog";
import {
  type Block,
  buildSteps,
  estimateMinutes,
  type Intensidade,
  type LevelMap,
  metaDaIntensidade,
  resolveSlot,
  trocaDaIntensidade,
  type Workout,
} from "../catalog/workouts";
import { unlockAudio } from "../engine/voice";

export type CountMode = "camera" | "manual" | "pareado";
const MODE_KEY = "bora:modo";

const unitOf = (id: string) => (exerciseById(id).rule.kind === "hold" ? "s" : "");

/** Um bloco como o perfil vai fazer: com os níveis dele e a intensidade (trocas e metas). */
export function describeBlock(
  b: Block,
  levels: LevelMap,
  intensidade: Intensidade = "normal",
): { name: string; detail: string } {
  const resolver = (slot: Parameters<typeof resolveSlot>[0]) => {
    const r = resolveSlot(slot, levels);
    return { ...r, exerciseId: trocaDaIntensidade(r.exerciseId, intensidade) };
  };
  if (b.type === "sets") {
    const { exerciseId, bonus } = resolver(b.slot);
    return {
      name: exerciseById(exerciseId).name,
      detail: `${b.sets} × ${metaDaIntensidade(b.target + bonus, intensidade)}${unitOf(exerciseId)}`,
    };
  }
  if (b.type === "interval")
    return {
      name: `${b.label}: ${b.slots.map((s) => exerciseById(resolver(s).exerciseId).name).join(" / ")}`,
      detail: `${b.rounds} × ${b.work}s/${b.rest}s`,
    };
  const items = b.slots.map((s) => {
    const r = resolver(s.slot);
    return `${metaDaIntensidade(s.reps + r.bonus, intensidade)} ${exerciseById(r.exerciseId).name.toLowerCase()}`;
  });
  return { name: `${b.label}: ${items.join(", ")}`, detail: `${b.minutes} min` };
}

export function WorkoutScreen({
  workout,
  workoutRef,
  levels,
  cameraAllowed,
  editHref,
  perfil,
}: {
  workout: Workout;
  workoutRef: string;
  levels: LevelMap;
  cameraAllowed: boolean;
  editHref?: string;
  /** de quem é o treino: os níveis, a intensidade e o histórico são deste perfil */
  perfil: { name: string; color: string; intensity: Intensidade };
}) {
  const router = useRouter();
  const [mode, setMode] = useState<CountMode>(cameraAllowed ? "camera" : "manual");
  useEffect(() => {
    try {
      const saved = localStorage.getItem(MODE_KEY) as CountMode | null;
      if (saved && (saved === "manual" || cameraAllowed)) setMode(saved);
    } catch {
      // sem armazenamento local: fica o padrão
    }
  }, [cameraAllowed]);
  const steps = buildSteps(workout, levels, { intensidade: perfil.intensity });
  const hints = [
    ...new Set(
      steps.flatMap((s) => (s.kind === "exercise" ? [exerciseById(s.exerciseId).cameraHint] : [])),
    ),
  ];
  const equipment = [
    ...new Set(
      steps.flatMap((s) => {
        if (s.kind !== "exercise") return [];
        const eq = exerciseById(s.exerciseId).equipment;
        return eq === "chão"
          ? []
          : [eq === "apoio" ? "um apoio firme (sofá ou cadeira)" : "uma parede livre"];
      }),
    ),
  ];

  const start = () => {
    unlockAudio();
    try {
      localStorage.setItem(MODE_KEY, mode);
    } catch {
      // a escolha só não fica lembrada
    }
    router.push(`/treinar?ref=${encodeURIComponent(workoutRef)}&modo=${mode}`);
  };

  return (
    <div className="screen">
      <header className="topbar">
        <button
          type="button"
          className="icon-btn"
          onClick={() => voltar(router, "/inicio")}
          aria-label="Voltar"
        >
          <ArrowLeft size={20} />
        </button>
        <span className="spacer" />
        {editHref && (
          <Link href={editHref} className="btn ghost">
            Editar treino
          </Link>
        )}
      </header>
      <main className="scroll narrow" id="conteudo">
        <div className="workout-head">
          <div>
            <span className="muted">
              {workout.level} · {workout.focus} · ~{estimateMinutes(workout)} min
            </span>
            <h1>{workout.name}</h1>
            <p className="muted lead">{workout.subtitle}</p>
            <p className="quem-treina">
              <Avatar profile={perfil} size="1.75rem" /> Treinando como {perfil.name} ·{" "}
              <Link href="/perfis">trocar</Link>
            </p>
          </div>
          <button type="button" className="btn primary big" onClick={start} data-autofocus>
            <Play size={20} fill="currentColor" /> Começar treino
          </button>
        </div>

        <div className="block-list">
          {workout.blocks
            .map((b) => describeBlock(b, levels, perfil.intensity))
            .map((row, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: o mesmo bloco pode se repetir; a posição é a identidade
              <div className="block-row" key={`${i}-${row.name}`}>
                <span className="idx">{i + 1}</span>
                <span className="name">{row.name}</span>
                <span className="detail">{row.detail}</span>
              </div>
            ))}
        </div>
        {equipment.length > 0 && (
          <p className="muted spaced">Você vai precisar de {equipment.join(" e ")}.</p>
        )}

        <div className="mode-pick three">
          <ModeOption
            active={mode === "camera"}
            locked={!cameraAllowed}
            onClick={() => setMode("camera")}
            icon={<Camera size={28} />}
            title="Contar pela câmera"
            text="O app reconhece cada repetição. A imagem fica só no aparelho."
          />
          <ModeOption
            active={mode === "pareado"}
            locked={!cameraAllowed}
            onClick={() => setMode("pareado")}
            icon={<Smartphone size={28} />}
            title="Celular como câmera"
            text="A TV mostra o treino e o celular, no chão, conta as repetições."
          />
          <ModeOption
            active={mode === "manual"}
            onClick={() => setMode("manual")}
            icon={<Hand size={28} />}
            title="Contar manualmente"
            text="Toque na tela, aperte espaço ou o OK do controle a cada repetição."
          />
        </div>
        {mode !== "manual" && (
          <div className="card">
            <strong>Posicione a câmera</strong>
            <ul className="hint-list">
              {hints.map((h) => (
                <li key={h}>{h}</li>
              ))}
              <li>Afaste-se 2 a 3 metros, em um lugar bem iluminado</li>
              {mode === "pareado" && (
                <li>Na próxima tela, aponte a câmera do celular para o código que aparece na TV</li>
              )}
            </ul>
          </div>
        )}
      </main>
    </div>
  );
}

function ModeOption({
  active,
  locked,
  onClick,
  icon,
  title,
  text,
}: {
  active: boolean;
  locked?: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  if (locked)
    return (
      <Cadeado
        motivo={title.includes("Celular") ? "tv" : "camera"}
        className="card mode-option locked"
      >
        <Lock size={28} />
        <span>
          <strong>{title}</strong>
          <span className="muted">Na assinatura. {text}</span>
        </span>
      </Cadeado>
    );
  return (
    <button type="button" className="card mode-option" aria-pressed={active} onClick={onClick}>
      {icon}
      <span>
        <strong>{title}</strong>
        <span className="muted">{text}</span>
      </span>
    </button>
  );
}
