"use client";

import { Button, type ButtonProps } from "@informach/ui/components/button";
import { cn } from "@informach/ui/lib/utils";
import { Loader2, Mic, Square } from "lucide-react";
import * as React from "react";

export type SpeechInputState = "idle" | "recording" | "processing";

export type SpeechInputProps = Omit<ButtonProps, "onError" | "onChange"> & {
  /** Called once with the final transcript after `onAudioRecorded` resolves. */
  onTranscriptionChange?: (text: string) => void;
  /**
   * Required handler that receives the recorded audio Blob and returns the
   * transcript. The host app POSTs to its own server route (rate-limited,
   * Pro-gated, billed) and returns the resulting text.
   */
  onAudioRecorded: (audioBlob: Blob) => Promise<string>;
  /** Called when MediaRecorder/permission errors surface so callers can show a toast. */
  onError?: (error: unknown) => void;
  /** Optional state callback for callers that want to drive their own UI in addition. */
  onStateChange?: (state: SpeechInputState) => void;
  /** Reserved for future use (currently the server picks the language). */
  lang?: string;
  /** Hard ceiling on recording time. Defaults to 60s. */
  maxDurationMs?: number;
  /**
   * MediaTrackConstraints passed to `getUserMedia({ audio })`. Defaults are
   * tuned for STT: AGC + noise suppression + echo cancellation, 16 kHz mono
   * (Whisper's native sample rate). Browsers may ignore individual fields
   * (Safari iOS ignores `sampleRate`) — that's fine, the server reamostra.
   */
  audioConstraints?: MediaTrackConstraints;
  /**
   * Bitrate hint for `MediaRecorder`. Default 32 kbps Opus — sweet spot for
   * voice (Chrome's default varies 24–48 kbps, can clip quiet speech).
   */
  audioBitsPerSecond?: number;
  /**
   * Minimum recording duration enforced before `stopRecording()` actually
   * calls `recorder.stop()`. Guards palavra-única / clique-falsa-largada
   * where the user releases the mic before MediaRecorder flushes a chunk.
   * Default 500ms.
   */
  minDurationMs?: number;
};

const DEFAULT_AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: 1,
  sampleRate: 16000,
};

/**
 * Microphone button that records audio with `MediaRecorder` and hands the
 * resulting Blob to a caller-provided transcription function. Same prop
 * contract as Vercel's AI Elements `<SpeechInput>` (Apache 2.0) but always
 * uses MediaRecorder (no Web Speech API fallback) so the credit accounting on
 * the server stays consistent across browsers.
 *
 * Visual states:
 *  - idle       → mic icon
 *  - recording  → stop-square icon, ring + destructive accent
 *  - processing → spinner, disabled
 */
export const SpeechInput = React.forwardRef<HTMLButtonElement, SpeechInputProps>(
  function SpeechInput(
    {
      className,
      onTranscriptionChange,
      onAudioRecorded,
      onError,
      onStateChange,
      maxDurationMs = 60_000,
      audioConstraints,
      audioBitsPerSecond = 32_000,
      minDurationMs = 500,
      disabled,
      variant = "ghost",
      size = "icon",
      type,
      "aria-label": ariaLabel,
      lang: _lang,
      ...buttonProps
    },
    ref,
  ) {
    const [state, setState] = React.useState<SpeechInputState>("idle");
    const mountedRef = React.useRef(true);
    const startingRef = React.useRef(false);
    const recorderRef = React.useRef<MediaRecorder | null>(null);
    const chunksRef = React.useRef<Blob[]>([]);
    const streamRef = React.useRef<MediaStream | null>(null);
    const stopTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const recordingStartTimeRef = React.useRef<number>(0);
    const minDurationTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    const transition = React.useCallback(
      (next: SpeechInputState) => {
        if (!mountedRef.current) return;
        setState(next);
        onStateChange?.(next);
      },
      [onStateChange],
    );

    const cleanup = React.useCallback(() => {
      const recorder = recorderRef.current;
      recorderRef.current = null;
      if (recorder) {
        recorder.onstop = null;
        recorder.ondataavailable = null;
        if (recorder.state !== "inactive") recorder.stop();
      }
      chunksRef.current = [];
      if (stopTimeoutRef.current) {
        clearTimeout(stopTimeoutRef.current);
        stopTimeoutRef.current = null;
      }
      if (minDurationTimeoutRef.current) {
        clearTimeout(minDurationTimeoutRef.current);
        minDurationTimeoutRef.current = null;
      }
      if (streamRef.current) {
        for (const track of streamRef.current.getTracks()) {
          track.stop();
        }
        streamRef.current = null;
      }
      recorderRef.current = null;
    }, []);

    React.useEffect(() => {
      mountedRef.current = true;
      return () => {
        mountedRef.current = false;
        cleanup();
      };
    }, [cleanup]);

    async function startRecording() {
      if (startingRef.current || !mountedRef.current) return;
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        onError?.(new Error("MediaRecorder API unavailable"));
        return;
      }
      startingRef.current = true;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: audioConstraints ?? DEFAULT_AUDIO_CONSTRAINTS,
        });
        if (!mountedRef.current) {
          for (const track of stream.getTracks()) track.stop();
          return;
        }
        streamRef.current = stream;
        const mimeType = pickSupportedMimeType();
        const recorderOptions: MediaRecorderOptions = {
          ...(mimeType ? { mimeType } : {}),
          ...(audioBitsPerSecond ? { audioBitsPerSecond } : {}),
        };
        const recorder = new MediaRecorder(stream, recorderOptions);
        chunksRef.current = [];
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) chunksRef.current.push(event.data);
        };
        recorder.onstop = async () => {
          if (!mountedRef.current) {
            cleanup();
            return;
          }
          const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
          chunksRef.current = [];
          cleanup();
          if (blob.size === 0) {
            transition("idle");
            return;
          }
          transition("processing");
          try {
            const text = await onAudioRecorded(blob);
            if (text && mountedRef.current) onTranscriptionChange?.(text);
          } catch (err) {
            if (mountedRef.current) onError?.(err);
          } finally {
            transition("idle");
          }
        };
        recorderRef.current = recorder;
        // Timeslice de 250ms emite chunks regularmente via ondataavailable —
        // garante captura mesmo se o usuário soltar o mic antes do primeiro
        // flush natural (palavras únicas <1s).
        recorder.start(250);
        recordingStartTimeRef.current = Date.now();
        transition("recording");
        stopTimeoutRef.current = setTimeout(() => {
          if (recorderRef.current?.state === "recording") {
            recorderRef.current.stop();
          }
        }, maxDurationMs);
      } catch (err) {
        cleanup();
        transition("idle");
        if (mountedRef.current) onError?.(err);
      } finally {
        startingRef.current = false;
      }
    }

    function stopRecording() {
      if (recorderRef.current?.state !== "recording") {
        cleanup();
        transition("idle");
        return;
      }
      const elapsed = Date.now() - recordingStartTimeRef.current;
      const remaining = minDurationMs - elapsed;
      if (remaining > 0) {
        // Usuário soltou o mic muito rápido — segura mais um pouco para o
        // MediaRecorder coletar o fim da palavra antes do stop.
        minDurationTimeoutRef.current = setTimeout(() => {
          minDurationTimeoutRef.current = null;
          if (recorderRef.current?.state === "recording") {
            recorderRef.current.stop();
          }
        }, remaining);
        return;
      }
      recorderRef.current.stop();
    }

    const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
      buttonProps.onClick?.(event);
      if (event.defaultPrevented) return;
      if (state === "idle") void startRecording();
      else if (state === "recording") stopRecording();
    };

    const recording = state === "recording";
    const processing = state === "processing";
    const label =
      ariaLabel ?? (recording ? "Parar gravação" : processing ? "Transcrevendo…" : "Gravar voz");
    const icon = processing ? (
      <Loader2 className="size-4 animate-spin" aria-hidden />
    ) : recording ? (
      <Square className="size-4 fill-current" aria-hidden />
    ) : (
      <Mic className="size-4" aria-hidden />
    );

    return (
      <Button
        ref={ref}
        type={type ?? "button"}
        variant={variant}
        size={size}
        disabled={disabled || processing}
        aria-pressed={recording}
        aria-label={label}
        data-state={state}
        className={cn(
          recording && "bg-destructive/10 text-destructive hover:bg-destructive/15",
          className,
        )}
        {...buttonProps}
        onClick={handleClick}
      >
        {icon}
      </Button>
    );
  },
);

function pickSupportedMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4;codecs=mp4a.40.2",
    "audio/mp4",
    "audio/ogg;codecs=opus",
    "audio/ogg",
  ];
  for (const candidate of candidates) {
    if (MediaRecorder.isTypeSupported?.(candidate)) return candidate;
  }
  return undefined;
}
