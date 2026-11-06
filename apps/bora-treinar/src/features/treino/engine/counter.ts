import type { Cadence } from "../body/cadence";
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
 * spread: afastamento lateral (eixo x) entre os pontos esquerdo e direito de `part`
 *   dividido pelo mesmo afastamento de `ref` (1 = mesma largura). Joelhos sobre
 *   tornozelos mostra joelho caindo para dentro; tornozelos sobre quadril mostra
 *   pernas abertas. Por ser uma razão, não depende do tamanho da pessoa.
 */
export type Metric =
  | { kind: "angle"; at: [Part, Part, Part]; combine?: "visible" | "avg" | "min" | "max" }
  | { kind: "incline"; from: Part; to: Part }
  | { kind: "spread"; part: Part; ref: Part };

export interface Check {
  metric: Metric;
  min?: number;
  max?: number;
  /**
   * Quando a verificação vale (padrão "always"). "always": avisa se falhar em
   * mais de 30% dos quadros do movimento. "peak": vale só o quadro de maior
   * progresso da repetição, para o que só acontece no fundo (pernas abertas no
   * polichinelo).
   */
  at?: "always" | "peak";
  /** frase curta, falada em voz alta depois da repetição */
  cue: string;
}

export interface RepRule {
  kind: "reps";
  metric: Metric;
  /** valor na posição inicial (topo) */
  rest: number;
  /** valor que precisa ser alcançado para a repetição contar */
  peak: number;
  /**
   * fração do caminho que já conta como repetição completa (padrão 0,85). A
   * folga existe porque a câmera mede o corpo real com erro de alguns graus e
   * os limiares foram calibrados no instrutor 3D, que vai sempre até o fim.
   */
  full?: number;
  /** fração do caminho a partir da qual o movimento conta como parcial (padrão 0,45) */
  partial?: number;
  checks?: Check[];
}

export interface HoldRule {
  kind: "hold";
  conditions: Check[];
}

/**
 * Só cronômetro: alongamentos da volta à calma. A câmera não conta nada, a série não vira
 * registro, e o exercício fica fora da prática, dos desafios e das trilhas.
 */
export interface TimedRule {
  kind: "timed";
}

export type CountRule = RepRule | HoldRule | TimedRule;

export interface RepEvent {
  type: "rep" | "partial";
  at: number;
  duration: number;
  /** profundidade alcançada (1 = exatamente no limiar, acima disso mais fundo) */
  depth: number;
  issues: string[];
}

/** Visibilidade mínima de um ponto para a medida valer. */
const MIN_VIS = 0.5;
/**
 * Durante o movimento a exigência cai: no fundo da flexão ou do agachamento
 * mãos, cotovelos e joelhos ficam parcialmente encobertos e o detector baixa a
 * visibilidade justo no quadro que decide a profundidade.
 */
const MOVING_VIS = 0.3;
/** Progresso que inicia uma repetição e progresso que a encerra (histerese). */
const START_AT = 0.12;
const END_AT = 0.04;
/**
 * Perda curta do rastreamento (braço passando na frente do corpo, borrão de
 * movimento) não desfaz a repetição em andamento. Acima disso a contagem
 * recomeça do topo.
 */
const LOST_TOLERANCE_MS = 500;
/** Afastamento mínimo da referência (m) para a razão de `spread` fazer sentido. */
const MIN_SPREAD_REF = 0.04;

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

const SIDES = [0, 1] as const;

/** Ângulo de cada lado do corpo com pontos visíveis (só para medidas de ângulo). */
function evalSides(
  m: Extract<Metric, { kind: "angle" }>,
  lm: Landmark[],
  minVis = MIN_VIS,
): { value: number; conf: number }[] {
  return SIDES.flatMap((s) => {
    const [a, b, c] = m.at.map((p) => lm[IDX[p][s]]);
    const conf = Math.min(vis(a), vis(b), vis(c));
    return a && b && c && conf >= minVis ? [{ value: angle(a, b, c), conf }] : [];
  });
}

/** Avalia uma medida. Devolve null quando os pontos necessários não estão visíveis. */
export function evalMetric(
  m: Metric,
  lm: Landmark[],
  minVis = MIN_VIS,
): { value: number; conf: number } | null {
  if (m.kind === "spread") {
    // precisa dos dois lados: um lado só não tem afastamento
    const pts = [...IDX[m.part], ...IDX[m.ref]].map((i) => lm[i]);
    const [pl, pr, rl, rr] = pts;
    const conf = Math.min(...pts.map(vis));
    if (!pl || !pr || !rl || !rr || conf < minVis) return null;
    const ref = Math.abs(rl.x - rr.x);
    if (ref < MIN_SPREAD_REF) return null;
    return { value: Math.abs(pl.x - pr.x) / ref, conf };
  }
  if (m.kind === "incline") {
    const ok = SIDES.flatMap((s) => {
      const a = lm[IDX[m.from][s]];
      const b = lm[IDX[m.to][s]];
      const conf = Math.min(vis(a), vis(b));
      return a && b && conf >= minVis ? [{ a, b, conf }] : [];
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
  const [first, second] = evalSides(m, lm, minVis);
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

/** Verificação de forma num quadro; ponto invisível não reprova. */
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
  /** 0 no topo, 1 quando a repetição já conta (`full` do caminho até o limiar) */
  progress: number;
  conf: number;
  value: number | null;
  ready: boolean;
  events: RepEvent[];
}

/**
 * Conta repetições a partir de uma medida com histerese entre topo e fundo.
 *
 * O estado (começou, terminou) segue o valor filtrado, que não treme. A
 * profundidade alcançada, que decide entre repetição e parcial, segue o valor
 * bruto pela mediana dos últimos 3 quadros: o filtro atrasa e achata o fundo,
 * que dura poucos quadros, e a mediana descarta um quadro isolado fora da
 * curva.
 */
export interface RepCounterOptions {
  /**
   * Duração mínima (ms) de uma repetição ou parcial. Abaixo disso o movimento
   * é tratado como ruído (um tremor do detector até o fundo e de volta) e não
   * gera evento. Padrão 0; use `minRepMsFor(cadência)`.
   */
  minRepMs?: number;
}

/**
 * Duração mínima de uma repetição para a cadência do exercício: 38% da descida
 * mais a subida. Quem acelera bastante ainda conta; um pico de dois quadros não.
 */
export function minRepMsFor(c: Cadence) {
  return Math.round(0.38 * (c.down + c.up) * 1000);
}

export class RepCounter {
  private filter = new OneEuro();
  private state: "waiting" | "top" | "moving" = "waiting";
  private startT = 0;
  private maxP = 0;
  private frames = 0;
  private fails = new Map<string, number>();
  /** progresso bruto do quadro mais fundo da repetição e as verificações "peak" reprovadas nele */
  private peakP = Number.NEGATIVE_INFINITY;
  private peakFails = new Set<string>();
  private recent: number[] = [];
  /** instante em que a medida sumiu (null enquanto visível) */
  private lostAt: number | null = null;
  private readonly minRepMs: number;
  progress = 0;

  constructor(
    readonly rule: RepRule,
    opts: RepCounterOptions = {},
  ) {
    this.minRepMs = opts.minRepMs ?? 0;
  }

  reset() {
    this.filter.reset();
    this.state = "waiting";
    this.progress = 0;
    this.recent = [];
    this.lostAt = null;
  }

  /** Estado interno, lido pelo laboratório de calibração do playground. */
  get debug() {
    return { state: this.state, reached: this.state === "moving" ? this.maxP : 0 };
  }

  private toProgress(value: number) {
    return (value - this.rule.rest) / (this.rule.peak - this.rule.rest);
  }

  update(lm: Landmark[], tMs: number): RepUpdate {
    const minVis = this.state === "moving" ? MOVING_VIS : MIN_VIS;
    const r = evalMetric(this.rule.metric, lm, minVis);
    if (!r) {
      this.lostAt ??= tMs;
      if (tMs - this.lostAt > LOST_TOLERANCE_MS) this.reset();
      return {
        progress: this.progress,
        conf: 0,
        value: null,
        ready: this.state !== "waiting",
        events: [],
      };
    }
    this.lostAt = null;
    const value = this.filter.filter(r.value, tMs / 1000);
    const p = this.toProgress(value);
    const rawP = this.toProgress(r.value);
    this.recent.push(rawP);
    if (this.recent.length > 3) this.recent.shift();
    const reached = median(this.recent);
    // a barra e o instrutor que acompanha chegam ao fundo quando a repetição já conta
    this.progress = Math.max(0, Math.min(1, p / (this.rule.full ?? 0.85)));
    const events: RepEvent[] = [];

    if (this.state === "waiting") {
      if (p <= END_AT) this.state = "top";
    } else if (this.state === "top") {
      if (p > START_AT) {
        this.state = "moving";
        this.startT = tMs;
        this.maxP = Math.max(p, reached);
        this.frames = 0;
        this.fails.clear();
        this.peakP = Number.NEGATIVE_INFINITY;
        this.peakFails.clear();
      }
    } else {
      this.maxP = Math.max(this.maxP, p, reached);
      this.frames++;
      const deepest = rawP > this.peakP;
      if (deepest) {
        this.peakP = rawP;
        this.peakFails.clear();
      }
      for (const c of this.rule.checks ?? []) {
        if (c.at === "peak") {
          if (deepest && !passes(c, lm)) this.peakFails.add(c.cue);
        } else if (!passes(c, lm)) this.fails.set(c.cue, (this.fails.get(c.cue) ?? 0) + 1);
      }
      if (p <= END_AT) {
        const issues = [
          ...[...this.fails].filter(([, n]) => n > this.frames * 0.3).map(([cue]) => cue),
          ...this.peakFails,
        ];
        const base = { at: tMs, duration: tMs - this.startT, depth: this.maxP };
        // rápido demais para ser gente: tremor do detector, não repetição
        if (base.duration >= this.minRepMs) {
          if (this.maxP >= (this.rule.full ?? 0.85)) events.push({ type: "rep", ...base, issues });
          else if (this.maxP >= (this.rule.partial ?? 0.45))
            events.push({ type: "partial", ...base, issues });
        }
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

function median(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? 0;
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
