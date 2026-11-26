import type { AlignEdge, Axis } from "@shared/align";
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  type LucideIcon,
  MoveHorizontal,
  MoveVertical,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { type Arrangement, arrangeClips } from "@/lib/align";
import { useApp } from "@/state/app";
import { IconButton } from "@/ui";

const EDGES: { edge: AlignEdge; icon: LucideIcon; label: string }[] = [
  { edge: "left", icon: AlignStartVertical, label: "Alinhar à esquerda" },
  { edge: "center", icon: AlignCenterVertical, label: "Centralizar na horizontal" },
  { edge: "right", icon: AlignEndVertical, label: "Alinhar à direita" },
  { edge: "top", icon: AlignStartHorizontal, label: "Alinhar no topo" },
  { edge: "middle", icon: AlignCenterHorizontal, label: "Centralizar na vertical" },
  { edge: "bottom", icon: AlignEndHorizontal, label: "Alinhar na base" },
];

/** Space chosen last for Espaço fixo, kept while the editor is open. */
let lastGap = 24;

/**
 * Alinhar (and, with several clips, Espaçamento) for what is on screen: each button moves the
 * clips by the box of what they draw, at the playhead, in one Ctrl+Z. Several clips line up with
 * each other (the box around them) or with the video; one clip lines up with the video.
 */
export function AlignControls({ ids }: { ids: string[] }): ReactNode {
  const several = ids.length > 1;
  const [to, setTo] = useState<"selection" | "frame">("selection");
  const [gap, setGap] = useState(String(lastGap));
  const [busy, setBusy] = useState(false);
  const run = (how: Arrangement): void => {
    setBusy(true);
    arrangeClips(ids, how)
      .then((moved) => {
        if (!moved) useApp.getState().toast("Já está assim: nada mudou de lugar.", "info");
      })
      .catch((error: unknown) =>
        useApp
          .getState()
          .toast(error instanceof Error ? error.message : "Não foi possível alinhar.", "error"),
      )
      .finally(() => setBusy(false));
  };
  const spaced = Number(gap.replace(",", "."));
  const gapOk = gap.trim() !== "" && Number.isFinite(spaced) && spaced >= 0 && spaced <= 4000;
  const distribute = (axis: Axis, fixed: boolean): void => {
    if (fixed) lastGap = spaced;
    run({ distribute: axis, ...(fixed ? { gap: spaced } : {}) });
  };

  return (
    <div className="props-section align-controls">
      <h3>Alinhar</h3>
      {several && (
        <div className="chip-row">
          <button
            type="button"
            className={`chip ${to === "selection" ? "is-active" : ""}`}
            onClick={() => setTo("selection")}
            title="Uns com os outros: pela caixa em volta dos selecionados"
          >
            Entre eles
          </button>
          <button
            type="button"
            className={`chip ${to === "frame" ? "is-active" : ""}`}
            onClick={() => setTo("frame")}
            title="Pelas bordas e pelo centro do vídeo"
          >
            Ao vídeo
          </button>
        </div>
      )}
      <div className="align-row">
        {EDGES.map(({ edge, icon, label }) => (
          <IconButton
            key={edge}
            type="button"
            icon={icon}
            label={several && to === "selection" ? label : `${label} do vídeo`}
            disabled={busy}
            onClick={() => run({ align: edge, to: several ? to : "frame" })}
          />
        ))}
      </div>
      {several && (
        <>
          <span className="field-label">Espaçamento</span>
          <div className="align-row">
            <IconButton
              type="button"
              icon={AlignHorizontalDistributeCenter}
              label="Mesmo espaço na horizontal (o primeiro e o último ficam onde estão)"
              disabled={busy || ids.length < 3}
              onClick={() => distribute("horizontal", false)}
            />
            <IconButton
              type="button"
              icon={AlignVerticalDistributeCenter}
              label="Mesmo espaço na vertical (o primeiro e o último ficam onde estão)"
              disabled={busy || ids.length < 3}
              onClick={() => distribute("vertical", false)}
            />
            <label className="align-gap" title="Espaço entre um e o próximo, em pixels do vídeo">
              Espaço
              <input
                type="number"
                min={0}
                max={4000}
                step={1}
                value={gap}
                aria-label="Espaço entre os clipes em pixels"
                onChange={(event) => setGap(event.target.value)}
              />
              px
            </label>
            <IconButton
              type="button"
              icon={MoveHorizontal}
              label="Aplicar este espaço na horizontal (o primeiro fica onde está)"
              disabled={busy || !gapOk}
              onClick={() => distribute("horizontal", true)}
            />
            <IconButton
              type="button"
              icon={MoveVertical}
              label="Aplicar este espaço na vertical (o de cima fica onde está)"
              disabled={busy || !gapOk}
              onClick={() => distribute("vertical", true)}
            />
          </div>
        </>
      )}
    </div>
  );
}
