import { exerciseById } from "../catalog/catalog";
import type { Step } from "../catalog/workouts";

export interface SetLog {
  exerciseId: string;
  kind: "reps" | "hold";
  target?: number;
  reps: number;
  partials: number;
  holdSeconds: number;
  seconds: number;
  /** problemas de execução detectados pela câmera, com contagem */
  issues: Record<string, number>;
}

export type RunnerEvent =
  | { type: "step"; index: number }
  | { type: "rep"; count: number; target?: number }
  | { type: "partial" }
  | { type: "set-done"; log: SetLog }
  | { type: "countdown"; seconds: number }
  | { type: "round"; rounds: number }
  | { type: "finish" };

/**
 * Executa os passos do treino. O relógio é injetado (monotônico) e o tempo só avança em `tick`,
 * o que mantém a contagem certa mesmo quando a tela trava por alguns quadros.
 */
export class WorkoutRunner {
  index = -1;
  paused = false;
  done = false;
  reps = 0;
  partials = 0;
  holdSeconds = 0;
  holding = false;
  /** posição no circuito do AMRAP */
  amrapPos = 0;
  amrapRounds = 0;
  amrapItemReps = 0;
  logs: SetLog[] = [];
  private issues: Record<string, number> = {};
  private amrapTotals = new Map<string, number>();
  private stepStart = 0;
  private pausedAt = 0;
  private pausedTotal = 0;
  /** pausas somadas no treino inteiro (ms) */
  private pausedAll = 0;
  private lastTick = 0;
  private completedAt = 0;
  private lastCountdown = -1;
  readonly startedAt: number;
  private listeners = new Set<(e: RunnerEvent) => void>();

  constructor(
    readonly steps: Step[],
    private now: () => number = () => performance.now(),
  ) {
    this.startedAt = now();
  }

  on(fn: (e: RunnerEvent) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private emit(e: RunnerEvent) {
    for (const fn of this.listeners) fn(e);
  }

  get step(): Step | undefined {
    return this.steps[this.index];
  }

  /** segundos decorridos no passo atual, sem contar pausas */
  get elapsed() {
    const end = this.paused ? this.pausedAt : this.now();
    return Math.max(0, (end - this.stepStart - this.pausedTotal) / 1000);
  }

  /** segundos restantes em passos com tempo (descanso, janela, AMRAP); null nos demais */
  get remaining(): number | null {
    const s = this.step;
    if (!s) return null;
    if (s.kind === "rest" || s.kind === "amrap") return Math.max(0, s.seconds - this.elapsed);
    if (s.window) return Math.max(0, s.window - this.elapsed);
    return null;
  }

  get isHold() {
    const s = this.step;
    return s?.kind === "exercise" && exerciseById(s.exerciseId).rule.kind === "hold";
  }

  /** exercício em execução (no AMRAP, o item atual do circuito) */
  get exerciseId(): string | undefined {
    const s = this.step;
    if (!s || s.kind === "rest") return undefined;
    return s.kind === "amrap" ? s.circuit[this.amrapPos]?.exerciseId : s.exerciseId;
  }

  get target(): number | undefined {
    const s = this.step;
    if (!s || s.kind === "rest") return undefined;
    return s.kind === "amrap" ? s.circuit[this.amrapPos]?.reps : s.target;
  }

  /** a meta da série foi cumprida (no EMOM a pessoa espera o minuto acabar) */
  get targetReached() {
    return this.completedAt > 0;
  }

  start() {
    if (this.index < 0) this.goto(0);
  }

  pause() {
    if (this.paused || this.done) return;
    this.paused = true;
    this.pausedAt = this.now();
  }

  resume() {
    if (!this.paused) return;
    this.pausedTotal += this.now() - this.pausedAt;
    this.pausedAll += this.now() - this.pausedAt;
    this.paused = false;
    this.lastTick = this.now();
  }

  /** pula para o próximo passo, registrando a série em andamento */
  next() {
    this.finishStep();
    this.goto(this.index + 1);
  }

  /** segundos de treino desde o início, sem pausas */
  get totalElapsed() {
    const end = this.paused ? this.pausedAt : this.now();
    return Math.max(0, (end - this.startedAt - this.pausedAll) / 1000);
  }

  /** mais tempo no descanso atual */
  extendRest(seconds: number) {
    const s = this.step;
    if (s?.kind === "rest") {
      s.seconds += seconds;
      this.lastCountdown = -1;
    }
  }

  /** encerra o treino agora, registrando a série em andamento */
  finish() {
    if (this.done) return;
    this.finishStep();
    this.goto(this.steps.length);
  }

  prev() {
    this.goto(Math.max(0, this.index - 1));
  }

  /** acrescenta (ou corrige, com valor negativo) repetições na série atual */
  addRep(n = 1, issues: string[] = []) {
    const s = this.step;
    if (!s || s.kind === "rest" || this.done || this.isHold) return;
    for (const i of issues) this.issues[i] = (this.issues[i] ?? 0) + 1;
    if (s.kind === "amrap") {
      const item = s.circuit[this.amrapPos];
      if (!item) return;
      this.amrapItemReps = Math.max(0, this.amrapItemReps + n);
      if (n > 0) {
        this.amrapTotals.set(item.exerciseId, (this.amrapTotals.get(item.exerciseId) ?? 0) + n);
        this.reps += n;
      }
      this.emit({ type: "rep", count: this.amrapItemReps, target: item.reps });
      if (this.amrapItemReps >= item.reps) {
        this.amrapItemReps = 0;
        this.amrapPos = (this.amrapPos + 1) % s.circuit.length;
        if (this.amrapPos === 0) this.emit({ type: "round", rounds: ++this.amrapRounds });
      }
      return;
    }
    this.reps = Math.max(0, this.reps + n);
    this.emit({ type: "rep", count: this.reps, target: s.target });
    if (s.target && this.reps >= s.target && !this.completedAt) this.completedAt = this.now();
    if (s.target && this.reps < s.target) this.completedAt = 0;
  }

  addPartial(issues: string[] = []) {
    if (this.step?.kind !== "exercise") return;
    for (const i of issues) this.issues[i] = (this.issues[i] ?? 0) + 1;
    this.partials++;
    this.emit({ type: "partial" });
  }

  setHolding(h: boolean) {
    this.holding = h;
  }

  tick() {
    const now = this.now();
    const dt = this.lastTick ? (now - this.lastTick) / 1000 : 0;
    this.lastTick = now;
    const s = this.step;
    if (!s || this.paused || this.done) return;
    if (this.isHold && this.holding) this.holdSeconds += Math.min(dt, 0.5);

    const rem = this.remaining;
    if (rem !== null) {
      const sec = Math.ceil(rem);
      if (sec <= 3 && sec >= 1 && sec !== this.lastCountdown) {
        this.lastCountdown = sec;
        this.emit({ type: "countdown", seconds: sec });
      }
      if (rem <= 0) return this.next();
    }
    if (s.kind !== "exercise") return;
    if (this.isHold && s.target && this.holdSeconds >= s.target && !s.window) return this.next();
    // deixa o número final na tela por um instante antes de seguir
    if (this.completedAt && !s.window && now - this.completedAt > 900) return this.next();
  }

  private finishStep() {
    const s = this.step;
    if (!s || s.kind === "rest") return;
    const seconds = Math.round(this.elapsed);
    if (s.kind === "amrap") {
      for (const [exerciseId, reps] of this.amrapTotals)
        this.pushLog({
          exerciseId,
          kind: "reps",
          reps,
          partials: 0,
          holdSeconds: 0,
          seconds,
          issues: {},
        });
      return;
    }
    this.pushLog({
      exerciseId: s.exerciseId,
      kind: this.isHold ? "hold" : "reps",
      target: s.target,
      reps: this.reps,
      partials: this.partials,
      holdSeconds: Math.round(this.holdSeconds),
      seconds,
      issues: this.issues,
    });
  }

  private pushLog(log: SetLog) {
    this.logs.push(log);
    this.emit({ type: "set-done", log });
  }

  private goto(i: number) {
    if (i >= this.steps.length) {
      this.index = this.steps.length;
      this.done = true;
      this.emit({ type: "finish" });
      return;
    }
    this.index = i;
    this.stepStart = this.now();
    this.pausedTotal = 0;
    if (this.paused) this.pausedAt = this.stepStart;
    this.reps = 0;
    this.partials = 0;
    this.holdSeconds = 0;
    this.completedAt = 0;
    this.issues = {};
    this.amrapPos = 0;
    this.amrapRounds = 0;
    this.amrapItemReps = 0;
    this.amrapTotals.clear();
    this.lastCountdown = -1;
    this.emit({ type: "step", index: i });
  }

  /** total de repetições registradas nas séries concluídas */
  get totalReps() {
    return this.logs.reduce((t, l) => t + l.reps, 0);
  }
}
