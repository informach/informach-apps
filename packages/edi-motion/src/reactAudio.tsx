import { useEffect, useRef, useState } from "react";
import type { AudioControlHandle, AudioStatus } from "./audio/model";

/** Shared controls for editor preview and exported React. Audio permission and
 * gain are session state, never edits to the authoring document. */
export function AudioControls({
  player,
  report,
  replay,
}: {
  player: AudioControlHandle | null;
  report?: (error: Error) => void;
  replay?: () => void;
}) {
  const [status, setStatus] = useState<AudioStatus | null>(null),
    [opening, setOpening] = useState(false),
    [error, setError] = useState(""),
    [captions, setCaptions] = useState<{ total: number; rows: { id: number; text: string }[] }>({
      total: 0,
      rows: [],
    }),
    active = useRef<AudioControlHandle | null>(null);
  useEffect(() => {
    active.current = player;
    setError("");
    setOpening(false);
    setCaptions({ total: 0, rows: [] });
    if (!player) {
      setStatus(null);
      return;
    }
    let live = true;
    const cleanups: (() => void)[] = [];
    try {
      setStatus(player.inspectAudio());
      cleanups.push(
        player.onAudioStateChange((value) => {
          if (live) setStatus(value);
        }),
      );
      cleanups.push(
        player.onAudioCue((cue) => {
          if (live)
            setCaptions((previous) => ({
              total: previous.total + 1,
              rows: [...previous.rows.slice(-15), { id: previous.total + 1, text: cue.caption }],
            }));
        }),
      );
    } catch (error) {
      for (const cleanup of cleanups.reverse()) cleanup();
      cleanups.length = 0;
      setStatus(null);
      setError(error instanceof Error ? error.message : "Controles de áudio indisponíveis.");
    }
    return () => {
      live = false;
      if (active.current === player) active.current = null;
      for (const cleanup of cleanups.reverse()) cleanup();
    };
  }, [player]);
  const failure = (error: unknown) => {
    const reason = error instanceof Error ? error : new Error("Operação de áudio recusada.");
    setError(reason.message);
    report?.(reason);
  };
  const toggle = async () => {
    if (!player || opening) return;
    const owner = player;
    setOpening(true);
    setError("");
    try {
      if (owner.inspectAudio().enabled) owner.disableAudio();
      else await owner.enableAudio();
    } catch (error) {
      if (active.current === owner) failure(error);
    } finally {
      if (active.current === owner) setOpening(false);
    }
  };
  return (
    <fieldset className="edi-audio-controls" aria-label="Áudio da animação">
      <legend>Áudio</legend>
      <button
        type="button"
        disabled={!status || status.destroyed || opening}
        onClick={() => void toggle()}
      >
        {opening ? "Ativando…" : status?.enabled ? "Desativar áudio" : "Ativar áudio"}
      </button>
      {replay && (
        <button
          type="button"
          disabled={!status || status.destroyed || opening}
          onClick={() => {
            try {
              replay();
            } catch (error) {
              failure(error);
            }
          }}
        >
          Reiniciar sessão e reproduzir
        </button>
      )}
      <label>
        Volume do áudio
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={status?.masterVolume ?? 1}
          disabled={!status || status.destroyed}
          onChange={(event) => {
            if (!player) return;
            try {
              player.setAudioVolume(Number(event.target.value));
            } catch (error) {
              failure(error);
            }
          }}
        />
      </label>
      <p>
        {status?.activeVoices ?? 0}/32 vozes · {status?.stolenVoices ?? 0} substituídas por limite ·{" "}
        {status?.skippedLate ?? 0} efeitos já encerrados no avanço
      </p>
      <ol aria-live="polite" aria-label="Alternativas dos efeitos de áudio">
        {captions.rows.map((caption) => (
          <li key={caption.id}>{caption.text}</li>
        ))}
      </ol>
      {captions.total > captions.rows.length && (
        <p>{captions.total - captions.rows.length} alternativas anteriores fora da janela de 16.</p>
      )}
      {error && <p role="alert">{error}</p>}
    </fieldset>
  );
}
