import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Landmark } from "../../body/landmarks";
import { exerciseById } from "../../catalog/catalog";
import { minRepMsFor, RepCounter, type RepEvent } from "../../engine/counter";

/** Gravação de uma pessoa de verdade diante da câmera (formato no README desta pasta). */
export interface Gravacao {
  exerciseId: string;
  fps: number;
  frames: { t: number; world: Landmark[] }[];
  expected: { reps: number; partials: number };
  /** quem gravou, câmera, luz, o que a gravação testa */
  nota?: string;
}

/** Lê e confere todos os `*.json` da pasta. */
export function carregarGravacoes(dir: string): { arquivo: string; gravacao: Gravacao }[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((arquivo) => {
      const g = JSON.parse(readFileSync(path.join(dir, arquivo), "utf8")) as Gravacao;
      const erro = conferir(g);
      if (erro) throw new Error(`${arquivo}: ${erro}`);
      return { arquivo, gravacao: g };
    });
}

function conferir(g: Gravacao): string | null {
  if (typeof g.exerciseId !== "string") return "exerciseId ausente";
  if (exerciseById(g.exerciseId).rule.kind !== "reps") return "só exercícios de repetição";
  if (!(g.fps > 0)) return "fps inválido";
  if (!Array.isArray(g.frames) || g.frames.length === 0) return "sem quadros";
  if (!Number.isInteger(g.expected?.reps) || !Number.isInteger(g.expected?.partials))
    return "expected.reps e expected.partials precisam ser inteiros";
  let antes = Number.NEGATIVE_INFINITY;
  for (const [i, f] of g.frames.entries()) {
    if (!(f.t >= antes)) return `quadro ${i}: t fora de ordem`;
    if (!Array.isArray(f.world) || (f.world.length !== 0 && f.world.length !== 33))
      return `quadro ${i}: world precisa ter 33 pontos (ou nenhum, sem pessoa)`;
    antes = f.t;
  }
  return null;
}

/** Passa a gravação pelo contador montado como no player. */
export function contarGravacao(g: Gravacao): {
  reps: number;
  partials: number;
  events: RepEvent[];
} {
  const ex = exerciseById(g.exerciseId);
  if (ex.rule.kind !== "reps") throw new Error(`${ex.id}: só exercícios de repetição`);
  const c = new RepCounter(ex.rule, { minRepMs: minRepMsFor(ex.cadence) });
  const events = g.frames.flatMap((f) => c.update(f.world, f.t).events);
  return {
    reps: events.filter((e) => e.type === "rep").length,
    partials: events.filter((e) => e.type === "partial").length,
    events,
  };
}
