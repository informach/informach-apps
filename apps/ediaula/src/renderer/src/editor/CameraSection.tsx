import {
  CAMERA_FRAMING_LABELS,
  CAMERA_FRAMINGS,
  type CameraFraming,
  frameCamera,
  framingOf,
} from "@shared/cameraFraming";
import { isPersonKey, PERSON_KEY } from "@shared/personKey";
import type { Asset, Clip } from "@shared/types";
import { Loader, Video } from "lucide-react";
import type { ReactNode } from "react";
import { keyIsCurrent } from "@/lib/keying";
import { activePalette } from "@/lib/palettes";
import { useApp } from "@/state/app";
import { useProject } from "@/state/project";
import { Toggle } from "@/ui";
import { setAssetKey } from "./ClipVisual";

/**
 * The webcam of a take: how it is framed in the lesson (every clip of it) and its background
 * removed by the local AI, which runs in the background like the color key and is used by the
 * preview and the export once it is ready.
 */
export function CameraSection({ clip, asset }: { clip: Clip; asset: Asset }): ReactNode {
  const project = useProject((s) => s.project);
  const jobs = useApp((s) => s.jobs);
  if (!project) return null;
  const job = Object.values(jobs).find((j) => j.label === `Removendo fundo: ${asset.name}`);
  const person = isPersonKey(asset.key);
  const current = framingOf(clip.transform, asset, project.settings);
  const frame = (framing: CameraFraming): void => {
    const accent = activePalette(project).roles.accent;
    useProject.getState().commit((p) => frameCamera(p, asset.id, framing, accent));
  };
  return (
    <div className="props-section">
      <h3>
        <Video size={13} /> Câmera
      </h3>
      <span className="field-label">Enquadramento</span>
      <div className="chip-row">
        {CAMERA_FRAMINGS.map((f) => (
          <button
            type="button"
            key={f}
            className={`chip ${current === f ? "is-active" : ""}`}
            onClick={() => frame(f)}
            title={
              f === "side"
                ? "A câmera ocupa metade do quadro e a tela deste take, a outra metade"
                : undefined
            }
          >
            {CAMERA_FRAMING_LABELS[f]}
          </button>
        ))}
      </div>
      <p className="props-hint muted">Vale para todos os trechos desta câmera.</p>
      <div className="props-head">
        <span className="field-label">Remover fundo com IA local</span>
        <Toggle
          on={person}
          onChange={(on) => setAssetKey(asset.id, on ? { ...PERSON_KEY } : undefined)}
          label="Remover fundo com IA local"
        />
      </div>
      {person ? (
        <div className="key-status muted">
          {keyIsCurrent(asset) ? (
            "Pronto: a prévia e a exportação mostram só você, sem o fundo."
          ) : asset.keyStatus === "error" ? (
            <span className="err">Falhou. Desligue e ligue de novo para tentar outra vez.</span>
          ) : (
            <>
              <Loader size={12} className="spin" /> Processando
              {job ? ` ${Math.round(job.ratio * 100)}%` : "…"} (a prévia mostra o fundo até
              terminar)
            </>
          )}
        </div>
      ) : (
        <p className="props-hint muted">
          Separa você do ambiente, sem tela verde. Roda neste computador, sem enviar nada.
        </p>
      )}
    </div>
  );
}
