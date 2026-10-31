import type { Landmark } from "../body/landmarks";

export type Part = "shoulder" | "elbow" | "wrist" | "hip" | "knee" | "ankle" | "toe";
const IDX: Record<Part, [number, number]> = {
  shoulder: [11, 12],
  elbow: [13, 14],
  wrist: [15, 16],
  hip: [23, 24],
  knee: [25, 26],
  ankle: [27, 28],
  toe: [31, 32],
};

/**
 * Medida extraída dos pontos do corpo.
 * angle: ângulo interno na articulação do meio (graus), combinando os dois lados.
 * incline: inclinação do segmento em relação à vertical (0 = em pé, 90 = deitado).
 */
export type Metric =
  | { kind: "angle"; at: [Part, Part, Part]; combine?: "visible" | "avg" | "min" | "max" }
  | { kind: "incline"; from: Part; to: Part };

export interface Check {
  metric: Metric;
  min?: number;
  max?: number;
  cue: string;
}

export interface RepRule {
  kind: "reps";
  metric: Metric;
  /** valor na posição inicial (topo) */
  rest: number;
  /** valor que precisa ser alcançado para a repetição contar */
  peak: number;
  /** fração do caminho a partir da qual o movimento conta como parcial (padrão 0,45) */
  partial?: number;
  checks?: Check[];
}

export interface HoldRule {
  kind: "hold";
  conditions: Check[];
}

export type CountRule = RepRule | HoldRule;

export interface RepEvent {
  type: "rep" | "partial";
  at: number;
  duration: number;
  /** profundidade alcançada (1 = exatamente no limiar, acima disso mais fundo) */
  depth: number;
  issues: string[];
}

const MIN_VIS = 0.5;

function angle(a: Landmark, b: Landmark, c: Landmark) {
  const ux = a.x - b.x,
    uy = a.y - b.y,
    uz = a.z - b.z;
  const wx = c.x - b.x,
    wy = c.y - b.y,
    wz = c.z - b.z;
  const d = Math.hypot(ux, uy, uz) * Math.hypot(wx, wy, wz) || 1;
  return (Math.acos(Math.max(-1, Math.min(1, (ux * wx + uy * wy + uz * wz) / d))) * 180) / Math.PI;
}

const vis = (l: Landmark | undefined) => (l ? (l.visibility ?? 1) : 0);

/** Avalia uma medida. Devolve null quando os pontos necessários não estão visíveis. */
export function evalMetric(m: Metric, lm: Landmark[]): { value: number; conf: number } | null {
  const SIDES = [0, 1] as const;
  if (m.kind === "incline") {
    const ok = SIDES.flatMap((s) => {
      const a = lm[IDX[m.from][s]];
      const b = lm[IDX[m.to][s]];
      const conf = Math.min(vis(a), vis(b));
      return a && b && conf >= MIN_VIS ? [{ a, b, conf }] : [];
    });
    if (!ok.length) return null;
    const avg = (k: "x" | "y" | "z", p: "a" | "b") =>
      ok.reduce((t, s) => t + s[p][k], 0) / ok.length;
    const dx = avg("x", "b") - avg("x", "a");
    const dy = avg("y", "b") - avg("y", "a");
    const dz = avg("z", "b") - avg("z", "a");
    const l = Math.hypot(dx, dy, dz) || 1;
    return {
      value: (Math.acos(Math.min(1, Math.abs(dy) / l)) * 180) / Math.PI,
      conf: Math.max(...ok.map((s) => s.conf)),
    };
  }
  const ok = SIDES.flatMap((s) => {
    const [a, b, c] = m.at.map((p) => lm[IDX[p][s]]);
    const conf = Math.min(vis(a), vis(b), vis(c));
    return a && b && c && conf >= MIN_VIS ? [{ value: angle(a, b, c), conf }] : [];
  });
  const [first, second] = ok;
  if (!first) return null;
  if (!second) return first;
  const conf = Math.max(first.conf, second.conf);
  const combine = m.combine ?? "visible";
  if (combine === "min") return { value: Math.min(first.value, second.value), conf };
  if (combine === "max") return { value: Math.max(first.value, second.value), conf };
  if (combine === "visible" && Math.abs(first.conf - second.conf) > 0.15)
    return first.conf > second.conf ? first : second;
  return { value: (first.value + second.value) / 2, conf };
}

const passes = (c: Check, lm: Landmark[]) => {
  const r = evalMetric(c.metric, lm);
  if (!r) return true;
  return (c.min === undefined || r.value >= c.min) && (c.max === undefined || r.value <= c.max);
};

/** Filtro One Euro: suaviza ruído quando parado e responde rápido quando há movimento. */
export class OneEuro {
  private x: number | null = null;
  private dx = 0;
  private t = 0;
  constructor(
    private minCutoff = 1.5,
    private beta = 0.02,
    private dCutoff = 1,
  ) {}
  private static alpha(cutoff: number, dt: number) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }
  filter(value: number, tSec: number) {
    if (this.x === null) {
      this.x = value;
      this.t = tSec;
      return value;
    }
    const dt = Math.max(1e-3, tSec - this.t);
    this.t = tSec;
    const dv = (value - this.x) / dt;
    this.dx += OneEuro.alpha(this.dCutoff, dt) * (dv - this.dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    this.x += OneEuro.alpha(cutoff, dt) * (value - this.x);
    return this.x;
  }
  reset() {
    this.x = null;
  }
}

export interface RepUpdate {
  /** 0 no topo, 1 no limiar do fundo */
  progress: number;
  conf: number;
  value: number | null;
  ready: boolean;
  events: RepEvent[];
}

/** Conta repetições a partir de uma medida com histerese entre topo e fundo. */
export class RepCounter {
  private filter = new OneEuro();
  private state: "waiting" | "top" | "moving" = "waiting";
  private startT = 0;
  private maxP = 0;
  private frames = 0;
  private fails = new Map<string, number>();
  progress = 0;

  constructor(readonly rule: RepRule) {}

  reset() {
    this.filter.reset();
    this.state = "waiting";
    this.progress = 0;
  }

  update(lm: Landmark[], tMs: number): RepUpdate {
    const r = evalMetric(this.rule.metric, lm);
    if (!r)
      return {
        progress: this.progress,
        conf: 0,
        value: null,
        ready: this.state !== "waiting",
        events: [],
      };
    const value = this.filter.filter(r.value, tMs / 1000);
    const p = (value - this.rule.rest) / (this.rule.peak - this.rule.rest);
    this.progress = Math.max(0, Math.min(1, p));
    const events: RepEvent[] = [];

    if (this.state === "waiting") {
      if (p <= 0) this.state = "top";
    } else if (this.state === "top") {
      if (p > 0.12) {
        this.state = "moving";
        this.startT = tMs;
        this.maxP = p;
        this.frames = 0;
        this.fails.clear();
      }
    } else {
      this.maxP = Math.max(this.maxP, p);
      this.frames++;
      for (const c of this.rule.checks ?? [])
        if (!passes(c, lm)) this.fails.set(c.cue, (this.fails.get(c.cue) ?? 0) + 1);
      if (p <= 0) {
        const issues = [...this.fails].filter(([, n]) => n > this.frames * 0.3).map(([cue]) => cue);
        const base = { at: tMs, duration: tMs - this.startT, depth: this.maxP };
        if (this.maxP >= 1) events.push({ type: "rep", ...base, issues });
        else if (this.maxP >= (this.rule.partial ?? 0.45))
          events.push({ type: "partial", ...base, issues });
        this.state = "top";
      }
    }
    return {
      progress: this.progress,
      conf: r.conf,
      value,
      ready: this.state !== "waiting",
      events,
    };
  }
}

export interface HoldUpdate {
  holding: boolean;
  conf: number;
  cue: string | null;
}

/** Diz se a pessoa está mantendo a postura de uma isometria (com tolerância de 300 ms). */
export class HoldTracker {
  private holding = false;
  private since = 0;
  constructor(readonly rule: HoldRule) {}

  update(lm: Landmark[], tMs: number): HoldUpdate {
    let conf = 1;
    let cue: string | null = null;
    for (const c of this.rule.conditions) {
      const r = evalMetric(c.metric, lm);
      if (!r) {
        conf = 0;
        continue;
      }
      conf = Math.min(conf, r.conf);
      if ((c.min !== undefined && r.value < c.min) || (c.max !== undefined && r.value > c.max))
        cue ??= c.cue;
    }
    const now = conf > 0 && cue === null;
    if (now !== this.holding) {
      if (!this.since) this.since = tMs;
      if (tMs - this.since >= 300) {
        this.holding = now;
        this.since = 0;
      }
    } else this.since = 0;
    return { holding: this.holding, conf, cue };
  }
}
