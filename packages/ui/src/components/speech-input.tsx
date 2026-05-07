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
    const recorderRef = React.useRef<MediaRecorder | null>(null);
    const chunksRef = React.useRef<Blob[]>([]);
    const streamRef = React.useRef<MediaStream | null>(null);
    const stopTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    const transition = React.useCallback(
      (next: SpeechInputState) => {
        setState(next);
        onStateChange?.(next);
      },
      [onStateChange],
    );

    const cleanup = React.useCallback(() => {
      if (stopTimeoutRef.current) {
        clearTimeout(stopTimeoutRef.current);
        stopTimeoutRef.current = null;
      }
      if (streamRef.current) {
        for (const track of streamRef.current.getTracks()) {
          track.stop();
        }
        streamRef.current = null;
      }
      recorderRef.current = null;
    }, []);

    React.useEffect(() => cleanup, [cleanup]);

    async function startRecording() {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        onError?.(new Error("MediaRecorder API unavailable"));
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
        const mimeType = pickSupportedMimeType();
        const recorder = mimeType
          ? new MediaRecorder(stream, { mimeType })
          : new MediaRecorder(stream);
        chunksRef.current = [];
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) chunksRef.current.push(event.data);
        };
        recorder.onstop = async () => {
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
            if (text) onTranscriptionChange?.(text);
          } catch (err) {
            onError?.(err);
          } finally {
            transition("idle");
          }
        };
        recorderRef.current = recorder;
        recorder.start();
        transition("recording");
        stopTimeoutRef.current = setTimeout(() => {
          if (recorderRef.current?.state === "recording") {
            recorderRef.current.stop();
          }
        }, maxDurationMs);
      } catch (err) {
        cleanup();
        transition("idle");
        onError?.(err);
      }
    }

    function stopRecording() {
      if (recorderRef.current?.state === "recording") {
        recorderRef.current.stop();
      } else {
        cleanup();
        transition("idle");
      }
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
