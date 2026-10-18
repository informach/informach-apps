import type { HoldReason } from "@shared/frameClock";
import type { GuidedTakeStatus } from "@shared/guidedPlan";
import { Loader, Pause, Play, Square, Trash2 } from "lucide-react";
import type { ReactNode } from "react";

const clock = (s: number): string =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

const WAITING_FOR: Record<HoldReason, string> = {
  locate: "o alvo aparecer",
  wait: "a página ficar como a etapa pede",
  navigation: "a página da etapa abrir",
  encoder: "o codificador de vídeo",
  pause: "você retomar",
  paint: "a página desenhar o arrasto",
};

/**
 * A guided take in the lesson window: the page is captured offscreen, so the recorder shows a
 * small preview, the step under way and why the video is holding, with pause, stop and discard.
 */
export function GuidedWebPanel({
  status,
  stopping,
  keys,
  onToggle,
  onStop,
  onDiscard,
}: {
  status: GuidedTakeStatus | null;
  stopping: boolean;
  keys: { toggle: string; stop: string };
  onToggle: () => void;
  onStop: () => void;
  onDiscard: () => void;
}): ReactNode {
  const phase = status?.phase ?? "opening";
  const running = phase === "recording" || phase === "holding" || phase === "paused";
  const heading =
    stopping || phase === "saving"
      ? "Salvando a gravação…"
      : phase === "opening"
        ? "Abrindo a aula numa janela de captura…"
        : phase === "preparing"
          ? `Refazendo sem gravar as etapas anteriores à ${(status?.step ?? 0) + 1}…`
          : phase === "failed"
            ? `A etapa ${(status?.step ?? 0) + 1} não pôde ser feita`
            : phase === "done"
              ? "Demonstração concluída"
              : phase === "paused"
                ? "Pausado"
                : `Gravando a etapa ${(status?.step ?? 0) + 1} de ${status?.steps ?? 0}`;
  return (
    <section className="guided-web" aria-live="polite">
      <header>
        {(phase === "opening" || phase === "preparing" || stopping) && (
          <Loader size={16} className="spin" />
        )}
        <strong>{heading}</strong>
        {status && running && (
          <span className="mono">
            {clock(status.time)} de {clock(status.duration)}
          </span>
        )}
      </header>
      {status?.preview ? (
        <img src={status.preview} alt="Prévia da página gravada" />
      ) : (
        <div className="guided-web-empty" />
      )}
      {phase === "holding" && status?.holding && (
        <p>
          Esperando {WAITING_FOR[status.holding]}. O vídeo fica parado enquanto isso e a narração
          continua alinhada.
        </p>
      )}
      {phase === "failed" && status?.message && (
        <p role="alert">
          {status.message} Salve o que foi gravado e corrija a etapa: depois use Continuar da etapa{" "}
          {(status.step ?? 0) + 1}.
        </p>
      )}
      <div className="guided-web-actions">
        {running && (
          <button type="button" onClick={onToggle} disabled={stopping}>
            {phase === "paused" ? <Play size={14} /> : <Pause size={14} />}{" "}
            {phase === "paused" ? "Retomar" : "Pausar"} ({keys.toggle})
          </button>
        )}
        <button type="button" className="rec-stop" onClick={onStop} disabled={stopping}>
          <Square size={12} fill="currentColor" /> Parar e salvar ({keys.stop})
        </button>
        <button type="button" onClick={onDiscard} disabled={stopping}>
          <Trash2 size={14} /> Descartar
        </button>
      </div>
    </section>
  );
}
