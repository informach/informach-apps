export type WebAnimationValue = string | number | boolean;
export interface WebAnimationInfo {
  title: string;
  version: number;
  viewBox: readonly [number, number, number, number];
  fit: "contain" | "cover" | "stretch";
  autoplay: boolean;
  respectReducedMotion: boolean;
  pauseOffscreen: boolean;
  inputs: readonly {
    name: string;
    kind: "number" | "boolean" | "string" | "color" | "enum" | "trigger";
  }[];
  machines: readonly string[];
  events: readonly string[];
  poster?: { dataUri: string; width: number; height: number; bytes: number };
}
export interface WebAnimationState {
  machine: string | null;
  time: number;
  playing: boolean;
  layers: { name: string; state: string; time: number }[];
}
export interface WebAnimationEvent {
  name: string;
  data: Readonly<Record<string, WebAnimationValue | null>>;
  direction: "forward" | "reverse";
  time: number;
  instancePath: readonly string[];
}
export interface WebAnimationOptions {
  autoplay?: boolean;
  respectReducedMotion?: boolean;
  pauseOffscreen?: boolean;
  signal?: AbortSignal;
  onEvent?: (event: WebAnimationEvent) => void;
  onStateChange?: (state: WebAnimationState) => void;
  onError?: (error: Error) => void;
}
export interface WebAnimationHandle {
  readonly playing: boolean;
  play(): void;
  pause(): void;
  reset(): void;
  setInput(name: string, value: WebAnimationValue): void;
  setInputs(values: Readonly<Record<string, WebAnimationValue>>): void;
  getInput(name: string): WebAnimationValue | undefined;
  trigger(name: string): void;
  setMachine(name: string): void;
  setPolicy(policy: { respectReducedMotion?: boolean; pauseOffscreen?: boolean }): void;
  advance(seconds: number): void;
  inspect(): WebAnimationState;
  destroy(): Promise<void>;
}
