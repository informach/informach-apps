import { retryAt, swapAttempt } from "@shared/attempts";
import type { Asset, Project } from "@shared/types";
import { RotateCcw } from "lucide-react";
import type { ReactNode } from "react";
import { useApp } from "@/state/app";
import { playback } from "@/state/playback";
import { useProject } from "@/state/project";
import { Button } from "@/ui";

const clock = (s: number): string =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** "Errei, voltar": the other attempt of retry `index` of the media in its place, one undo step. */
export function swapRetry(assetId: string, index: number): boolean {
  const { project, commit } = useProject.getState();
  if (!project) return false;
  const next = swapAttempt(project, assetId, index);
  if (!next) {
    useApp
      .getState()
      .toast(
        "Esse trecho não está mais na aula (foi cortado ou está numa faixa travada).",
        "error",
      );
    return false;
  }
  return commit((p) => ({ ...p, ...next }));
}

/**
 * The attempts of a screen recording ("Errei, voltar"): where each one is, which is in the
 * lesson, and the other one put back with a click.
 */
export function RetrySection({ project, asset }: { project: Project; asset: Asset }): ReactNode {
  const retries = asset.retries ?? [];
  if (!retries.length) return null;
  return (
    <div className="props-section">
      <h3>
        <RotateCcw size={13} /> Tentativas
      </h3>
      <p className="props-hint muted">
        Onde você usou Errei, voltar, a aula ficou com a última tentativa. A anterior continua
        guardada. A troca vale para a tela; câmera e som do PC do take seguem a última tentativa.
      </p>
      <ul className="retry-list">
        {retries.map((r, i) => {
          const at = retryAt(project, asset.id, r);
          const earlier = r.using === "earlier";
          return (
            <li key={`${r.earlier[0]}-${r.later}`}>
              <span className="mono">{at === null ? "fora da aula" : clock(at)}</span>
              <span>{earlier ? "a anterior" : "a última"}</span>
              <Button
                size="sm"
                disabled={at === null}
                onClick={() => at !== null && playback.seek(at)}
              >
                Ir até
              </Button>
              <Button size="sm" disabled={at === null} onClick={() => swapRetry(asset.id, i)}>
                {earlier ? "Voltar à última" : "Usar a anterior"}
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
