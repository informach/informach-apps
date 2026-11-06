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
  /** treinar junto: de quem é a série (só no aparelho) */
  profileId?: string;
}

export type RunnerEvent =
  | { type: "step"; index: number }
  /** `delta` negativo é correção (−1): quem ouve não comemora nem fala o número */
  | { type: "rep"; count: number; target?: number; delta: number }
  | { type: "partial" }
  | { type: "set-done"; log: SetLog }
  | { type: "countdown"; seconds: number }
  /** mais um segundo inteiro na posição da isometria (1, 2, 3…), para contar em voz alta */
  | { type: "hold-second"; seconds: number; target?: number }
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
  private completedAt: number | null = null;
  private lastCountdown = -1;
  private lastHoldSecond = 0;
  /** segundos somados ao descanso atual (+15 s), sem mexer no passo, que é compartilhado */
  private restExtra = 0;
  /** passo de cada registro, para `prev()` desfazer a série que vai ser refeita */
  private logSteps: number[] = [];
  /** início real (relógio monotônico), marcado em `start()`; antes dele o treino não conta */
  startedAt = 0;
  /** início real no relógio de parede, para a sessão gravar quando o treino começou */
  startedWallAt = 0;
  private listeners = new Set<(e: RunnerEvent) => void>();

  constructor(
    public steps: Step[],
    private now: () => number = () => performance.now(),
    private wallNow: () => number = () => Date.now(),
  ) {}

  /**
   * Troca os passos antes do começo (o portão "Pronto?" liga ou desliga o aquecimento e a volta à
   * calma). Depois do start não muda nada: o treino em andamento é o que foi planejado.
   */
  trocarPassos(steps: Step[]) {
    if (this.started || !steps.length) return false;
    this.steps = steps;
    return true;
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
    if (s.kind === "rest") return Math.max(0, s.seconds + this.restExtra - this.elapsed);
    if (s.kind === "amrap") return Math.max(0, s.seconds - this.elapsed);
    if (s.window) return Math.max(0, s.window - this.elapsed);
    return null;
  }

  get isHold() {
    const s = this.step;
    return s?.kind === "exercise" && exerciseById(s.exerciseId).rule.kind === "hold";
  }

  /** alongamento: só o cronômetro corre, sem contagem e sem registro de série */
  get isTimed() {
    const s = this.step;
    return s?.kind === "exercise" && exerciseById(s.exerciseId).rule.kind === "timed";
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
    return this.completedAt !== null;
  }

  get started() {
    return this.index >= 0;
  }

  start() {
    if (this.index >= 0) return;
    this.startedAt = this.now();
    this.startedWallAt = this.wallNow();
    this.lastTick = this.startedAt;
    this.goto(0);
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
    if (!this.started) return 0;
    const end = this.paused ? this.pausedAt : this.now();
    return Math.max(0, (end - this.startedAt - this.pausedAll) / 1000);
  }

  /** mais tempo no descanso atual */
  extendRest(seconds: number) {
    const s = this.step;
    if (s?.kind === "rest") {
      this.restExtra += seconds;
      this.lastCountdown = -1;
    }
  }

  /** encerra o treino agora, registrando a série em andamento */
  finish() {
    if (this.done) return;
    this.finishStep();
    this.goto(this.steps.length);
  }

  /**
   * Volta um passo. A série que vai ser refeita sai dos registros: sem isso ela entrava duas
   * vezes (a primeira, quando terminou, e a segunda, quando terminar de novo).
   */
  prev() {
    const target = Math.max(0, this.index - 1);
    while (this.logSteps.length && (this.logSteps.at(-1) ?? -1) >= target) {
      this.logSteps.pop();
      this.logs.pop();
    }
    this.goto(target);
  }

  /** acrescenta (ou corrige, com valor negativo) repetições na série atual */
  addRep(n = 1, issues: string[] = []) {
    const s = this.step;
    if (!s || s.kind === "rest" || this.done || this.isHold || this.isTimed) return;
    for (const i of issues) this.issues[i] = (this.issues[i] ?? 0) + 1;
    if (s.kind === "amrap") {
      const item = s.circuit[this.amrapPos];
      if (!item) return;
      // a correção (−1) também desconta do total do exercício, senão ela só mudava a tela
      const before = this.amrapItemReps;
      this.amrapItemReps = Math.max(0, before + n);
      const delta = this.amrapItemReps - before;
      if (!delta) return;
      this.amrapTotals.set(
        item.exerciseId,
        Math.max(0, (this.amrapTotals.get(item.exerciseId) ?? 0) + delta),
      );
      this.reps = Math.max(0, this.reps + delta);
      this.emit({ type: "rep", count: this.amrapItemReps, target: item.reps, delta });
      if (this.amrapItemReps >= item.reps) {
        this.amrapItemReps = 0;
        this.amrapPos = (this.amrapPos + 1) % s.circuit.length;
        if (this.amrapPos === 0) this.emit({ type: "round", rounds: ++this.amrapRounds });
      }
      return;
    }
    const before = this.reps;
    this.reps = Math.max(0, before + n);
    const delta = this.reps - before;
    if (!delta) return;
    this.emit({ type: "rep", count: this.reps, target: s.target, delta });
    if (s.target && this.reps >= s.target && this.completedAt === null)
      this.completedAt = this.now();
    if (s.target && this.reps < s.target) this.completedAt = null;
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
    if (this.isHold && this.holding) {
      this.holdSeconds += Math.min(dt, 0.5);
      const whole = Math.floor(this.holdSeconds);
      if (whole > this.lastHoldSecond) {
        this.lastHoldSecond = whole;
        this.emit({
          type: "hold-second",
          seconds: whole,
          target: s.kind === "exercise" ? s.target : undefined,
        });
      }
    }

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
    if (this.completedAt !== null && !s.window && now - this.completedAt > 900) return this.next();
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
    if (this.isTimed) return;
    this.pushLog({
      ...(s.profileId ? { profileId: s.profileId } : {}),
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
    this.logSteps.push(this.index);
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
    this.lastHoldSecond = 0;
    this.completedAt = null;
    this.issues = {};
    this.amrapPos = 0;
    this.amrapRounds = 0;
    this.amrapItemReps = 0;
    this.amrapTotals.clear();
    this.lastCountdown = -1;
    this.restExtra = 0;
    this.emit({ type: "step", index: i });
  }

  /** total de repetições registradas nas séries concluídas */
  get totalReps() {
    return this.logs.reduce((t, l) => t + l.reps, 0);
  }
}
