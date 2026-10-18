import type { WhisperVariant } from "../shared/types.ts";
import type { Expected } from "./download.ts";

export interface Download extends Expected {
  url: string;
}

/**
 * Pinned whisper.cpp build b5454 (the nightly of v1.9.5, 6 Oct 2026; the CUDA 12 build ships its
 * own cuBLAS, so no CUDA install is needed) and the models it runs. SHA-256 and sizes come from
 * the publishers: the `digest` GitHub lists for each release asset, and the LFS SHA-256 Hugging
 * Face lists for each file (also sent as `x-linked-etag`), at pinned repository revisions. The
 * files inside each engine zip are listed in whisperManifest.ts.
 */
const RELEASE = "https://github.com/ggml-org/whisper.cpp/releases/download/b5454";
const MODELS_AT =
  "https://huggingface.co/ggerganov/whisper.cpp/resolve/5359861c739e955e79d9a303bcbc70fb988958b1";
const VAD_AT =
  "https://huggingface.co/ggml-org/whisper-vad/resolve/9ffd54a1e1ee413ddf265af9913beaf518d1639b";

export const WHISPER_ASSETS = {
  engine: {
    cuda: {
      url: `${RELEASE}/whisper-bin-win-cuda-12.4.0-x64.zip`,
      sha256: "afef0b881c500958921c3f5523b50e59ee2ec9b6f5cbd25b324c51ed308a957a",
      size: 684913404,
    },
    cpu: {
      url: `${RELEASE}/whisper-bin-x64.zip`,
      sha256: "6ba69e3482d7826214f90a6a9c84ca07782aec1e1d0c6a7c30c994fd5d816ccb",
      size: 8928640,
    },
  },
  models: {
    "large-v3-turbo-q5_0": {
      url: `${MODELS_AT}/ggml-large-v3-turbo-q5_0.bin`,
      sha256: "394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2",
      size: 574041195,
    },
    small: {
      url: `${MODELS_AT}/ggml-small.bin`,
      sha256: "1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b",
      size: 487601967,
    },
  },
  /** Silero voice activity model for `--vad`. */
  vad: {
    url: `${VAD_AT}/ggml-silero-v6.2.0.bin`,
    sha256: "2aa269b785eeb53a82983a20501ddf7c1d9c48e33ab63a41391ac6c9f7fb6987",
    size: 885098,
  },
} as const satisfies {
  engine: Record<WhisperVariant, Download>;
  models: Record<string, Download>;
  vad: Download;
};

export type ModelName = keyof typeof WHISPER_ASSETS.models;

export const isModelName = (name: unknown): name is ModelName =>
  typeof name === "string" && Object.hasOwn(WHISPER_ASSETS.models, name);

export const isEngineVariant = (variant: unknown): variant is WhisperVariant =>
  typeof variant === "string" && Object.hasOwn(WHISPER_ASSETS.engine, variant);
