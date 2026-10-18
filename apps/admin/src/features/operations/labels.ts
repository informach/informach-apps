import type { Tone } from "@/components/status";
import type { ServiceState } from "@/lib/services";
import type { RoutineState } from "./routines";

export const SERVICE_STATE: Record<ServiceState, { tone: Tone; label: string }> = {
  up: { tone: "ok", label: "No ar" },
  slow: { tone: "warn", label: "Lento" },
  down: { tone: "bad", label: "Fora do ar" },
};

export const ROUTINE_STATE: Record<RoutineState, { tone: Tone; label: string }> = {
  ok: { tone: "ok", label: "Em dia" },
  failed: { tone: "bad", label: "Falhou" },
  running: { tone: "info", label: "Rodando" },
  interrupted: { tone: "bad", label: "Parou no meio" },
  late: { tone: "warn", label: "Atrasada" },
  never: { tone: "muted", label: "Sem registro" },
  paused: { tone: "muted", label: "Parada" },
};

/** "120 ms", "4,2 s" ou "sem resposta". */
export function latencyText(ms: number | null): string {
  if (ms === null) return "sem resposta";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} s`;
}

/** Duração de uma execução: "800 ms", "12 s", "3 min". */
export function runDuration(startedAt: Date, finishedAt: Date | null): string | null {
  if (!finishedAt) return null;
  const ms = Math.max(0, finishedAt.getTime() - startedAt.getTime());
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${Math.round(ms / 1000)} s`;
  return `${Math.round(ms / 60_000)} min`;
}
