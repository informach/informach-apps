/** Command line of whisper-cli (main/whisper.ts), kept apart so it can be checked in tests. */

/** Terms of the glossary that go into whisper's initial prompt; the rest only correct on reading. */
export const PROMPT_TERMS = 20;

/** Nudges whisper to write hesitations down instead of cleaning them up. */
const VERBATIM_PROMPT =
  "Ahn, então, né, tipo, é... a gente vai, hum, começar. Quem está, quem está participando?";

/** The initial prompt: the verbatim nudge, then the most relevant names of the course. */
export function whisperPrompt(terms: string[]): string {
  const names = terms.slice(0, PROMPT_TERMS);
  return names.length ? `${VERBATIM_PROMPT} ${names.join(", ")}.` : VERBATIM_PROMPT;
}

/** Leaves two cores to the editor and the system; whisper gains little past 16 threads. */
export const whisperThreads = (cores: number): number =>
  Math.min(16, Math.max(2, Math.floor(cores) - 2));

/** The build understands voice activity detection (whisper-cli prints its usage on stderr). */
export const helpHasVad = (help: string): boolean => /(^|\s)--vad(\s|$)/m.test(help);

/** whisper.cpp DTW presets per model family; DTW gives much better word timing. */
export function dtwPreset(modelName: string): string | null {
  const n = modelName.toLowerCase();
  if (n.includes("large-v3-turbo")) return "large.v3.turbo";
  if (n.includes("large-v3")) return "large.v3";
  if (n.includes("large-v2")) return "large.v2";
  for (const size of ["medium", "small", "base", "tiny"])
    if (n.startsWith(size)) return n.includes(".en") ? `${size}.en` : size;
  return null;
}

export interface WhisperRun {
  modelPath: string;
  modelName: string;
  wav: string;
  language: string;
  /** Output path without extension (whisper adds .json). */
  out: string;
  terms: string[];
  threads: number;
  cpu: boolean;
  /** Silero model for `--vad`, when the build supports it and the model is installed. */
  vadModel?: string | null;
}

export function whisperArgs(run: WhisperRun): string[] {
  const args = [
    "-m",
    run.modelPath,
    "-f",
    run.wav,
    "-l",
    run.language,
    "-ojf",
    "-of",
    run.out,
    "-pp",
    "--prompt",
    whisperPrompt(run.terms),
    "-t",
    String(run.threads),
  ];
  const dtw = dtwPreset(run.modelName);
  // DTW does not work with flash attention.
  if (dtw) args.push("-nfa", "-dtw", dtw);
  if (run.cpu) args.push("-ng");
  if (run.vadModel) args.push("--vad", "--vad-model", run.vadModel);
  return args;
}
