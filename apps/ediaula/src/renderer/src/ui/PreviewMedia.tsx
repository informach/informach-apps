import type { Clip } from "@shared/types";
import { clipCues, type TextCue, webVtt } from "@shared/webvtt";
import { useEffect, useMemo, useState } from "react";

const NO_CUES: readonly TextCue[] = [];
export function PreviewMedia({
  kind,
  src,
  cues = NO_CUES,
  clip,
  mediaRef,
  controls,
  label,
  className,
}: {
  kind: "audio" | "video";
  src: string;
  cues?: readonly TextCue[];
  clip?: Clip;
  mediaRef?: (element: HTMLVideoElement | HTMLAudioElement | null) => void;
  controls?: boolean;
  label?: string;
  className?: string;
}) {
  const text = useMemo(() => webVtt(clipCues(cues, clip)), [cues, clip]);
  const [trackUrl, setTrackUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!text) {
      setTrackUrl(null);
      return;
    }
    const url = URL.createObjectURL(new Blob([text], { type: "text/vtt" }));
    setTrackUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [text]);
  return kind === "audio" ? (
    <audio
      ref={mediaRef}
      src={src}
      preload="auto"
      controls={controls}
      aria-label={label}
      className={className}
    >
      <track
        kind="captions"
        src={trackUrl ?? undefined}
        srcLang="pt-BR"
        label="Texto da narração"
      />
    </audio>
  ) : (
    <video
      ref={mediaRef}
      src={src}
      preload="auto"
      playsInline
      controls={controls}
      aria-label={label}
      className={className}
    >
      <track kind="captions" src={trackUrl ?? undefined} srcLang="pt-BR" label="Legendas da aula" />
    </video>
  );
}
