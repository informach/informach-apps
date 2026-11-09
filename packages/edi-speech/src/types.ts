/**
 * Speech types shared by the Edi tools: what the transcription returns (in seconds of the source
 * file) and how the local engine is installed. Moved from EdiAula, which re-exports them.
 */

/** A spoken word, in seconds of the source file. `text` keeps attached punctuation. */
export interface Word {
  start: number;
  end: number;
  text: string;
  /** Recognition confidence, 0..1. */
  p: number;
  /** Index in the transcript as recognized, once corrections removed or joined words before it. */
  i?: number;
  /** What whisper heard, when the glossary changed the text. */
  heard?: string;
  /** Indexes (as recognized) of the words the glossary joined into this one. */
  joined?: number[];
  /** Set aside by the hallucination filter (shared/whisperParse.ts); hidden until restored. */
  dropped?: "silence" | "credit" | "signoff";
}

export interface Transcript {
  version: 1;
  model: string;
  language: string;
  duration: number;
  words: Word[];
  /** Silent stretches of the source audio, [start, end] in seconds. */
  silences: [number, number][];
  /** Speech stretches the VAD kept, [start, end] in source seconds (absent without VAD). */
  speech?: [number, number][];
  /** As read (shared/wordEdits.ts): hand corrections that found no word to apply to. */
  lostEdits?: number;
}

export type WhisperVariant = "cuda" | "cpu";

export interface WhisperModelInfo {
  name: string;
  path: string;
  size: number;
  /** Not one of the models the tool downloads and checks (C:\whisper-cpp, or another file). */
  unchecked?: boolean;
}

export interface EngineStatus {
  bin: string | null;
  variant: WhisperVariant | null;
  model: WhisperModelInfo | null;
  models: WhisperModelInfo[];
  /** An NVIDIA GPU is available, so the CUDA build is recommended. */
  gpu: boolean;
  /** The person chose to list models the tool cannot check (C:\whisper-cpp). */
  externalModels: boolean;
}
