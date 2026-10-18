import type { Clip } from "@shared/types";
import { previousZoom } from "@shared/zoomLayer";
import { Minimize2, MousePointerClick, MoveRight, Plus, ZoomIn } from "lucide-react";
import { type ReactNode, useState } from "react";
import { addZoomLayer, continueZoom, setZoomLayer } from "@/lib/zoomLayer";
import { useApp } from "@/state/app";
import { playback, usePlayback } from "@/state/playback";
import { useProject } from "@/state/project";
import { Button } from "@/ui";
import { Slider } from "./ClipVisual";

const SPOTS: [string, number, number][] = [
  ["↖", 0.25, 0.25],
  ["↑", 0.5, 0.25],
  ["↗", 0.75, 0.25],
  ["←", 0.25, 0.5],
  ["●", 0.5, 0.5],
  ["→", 0.75, 0.5],
  ["↙", 0.25, 0.75],
  ["↓", 0.5, 0.75],
  ["↘", 0.75, 0.75],
];

function Chips<T extends string>({
  value,
  options,
  onPick,
}: {
  value: T;
  options: [T, string][];
  onPick: (v: T) => void;
}): ReactNode {
  return (
    <div className="chip-row">
      {options.map(([id, label]) => (
        <button
          type="button"
          key={id}
          className={`chip ${value === id ? "is-active" : ""}`}
          onClick={() => onPick(id)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/**
 * Properties of a zoom layer, in Camtasia's terms: how close and where, whether it eases in and
 * out (each optional), and the next step (move to another spot, or back to normal).
 */
export function ZoomLayerSection({ clip }: { clip: Clip }): ReactNode {
  const project = useProject((s) => s.project);
  const [busy, setBusy] = useState(false);
  const z = clip.zoomLayer!;
  const set = (c: Parameters<typeof setZoomLayer>[1]): void => {
    setZoomLayer(clip.id, c);
  };
  const prev = project ? previousZoom(project, clip) : undefined;
  const continues = !!prev && prev.zoomLayer!.zoomOut === false;
  const next = project?.clips.find(
    (o) =>
      o.id !== clip.id &&
      o.zoomLayer &&
      o.trackId === clip.trackId &&
      Math.abs(o.start - (clip.start + clip.duration)) < 0.02,
  );
  const step = async (kind: "pan" | "restore"): Promise<void> => {
    setBusy(true);
    const id = await continueZoom(clip.id, kind);
    setBusy(false);
    if (id) {
      playback.seek(clip.start + clip.duration + 0.01);
      useApp
        .getState()
        .toast(
          kind === "pan"
            ? "Próximo ponto criado logo depois deste: arraste o retângulo no vídeo até onde o zoom deve ir."
            : "O zoom volta ao normal logo depois deste.",
          "success",
        );
    }
  };
  const zoomIn = z.zoomIn !== false;
  const zoomOut = z.zoomOut !== false;
  return (
    <div className="props-section">
      <h3>
        <ZoomIn size={13} /> Zoom das faixas abaixo
      </h3>
      <p className="props-hint muted">
        Tudo que está nas faixas abaixo desta aproxima enquanto ela dura; o que está acima fica como
        está. No vídeo, arraste o retângulo; a rodinha do mouse muda o quanto aproxima.
      </p>
      <Slider
        label="Aproximar"
        value={z.scale}
        min={1}
        max={5}
        step={0.05}
        format={(v) => (v < 1.01 ? "normal" : `${v.toFixed(2)}×`)}
        onCommit={(scale) => set({ scale })}
      />
      <span className="field-label">Ponto</span>
      <div className="zoom-spots">
        {SPOTS.map(([label, x, y]) => (
          <button
            type="button"
            key={label}
            className={`chip ${Math.abs(z.x - x) < 0.01 && Math.abs(z.y - y) < 0.01 ? "is-active" : ""}`}
            onClick={() => set({ x, y })}
          >
            {label}
          </button>
        ))}
      </div>
      <Slider
        label="Horizontal"
        value={z.x}
        min={0}
        max={1}
        step={0.005}
        onCommit={(x) => set({ x })}
      />
      <Slider
        label="Vertical"
        value={z.y}
        min={0}
        max={1}
        step={0.005}
        onCommit={(y) => set({ y })}
      />

      <span className="field-label">Entrada</span>
      <Chips
        value={zoomIn ? "on" : "off"}
        options={[
          ["on", continues ? "Mover do ponto anterior" : "Aproximar suave"],
          ["off", continues ? "Pular para cá" : "Começar já no zoom"],
        ]}
        onPick={(v) => set({ zoomIn: v === "on" })}
      />
      {zoomIn && (
        <Slider
          label="Duração"
          value={z.easeIn ?? z.ease ?? 0.6}
          min={0.1}
          max={3}
          step={0.05}
          format={(v) => `${v.toFixed(2)} s`}
          onCommit={(easeIn) => set({ easeIn })}
        />
      )}
      {continues && (
        <p className="props-hint muted">
          Continua do zoom anterior, sem voltar ao normal entre os dois.
        </p>
      )}

      <span className="field-label">Saída</span>
      <Chips
        value={zoomOut ? "on" : "off"}
        options={[
          ["on", "Voltar suave ao normal"],
          ["off", next ? "Seguir para o próximo" : "Ficar no zoom até o fim"],
        ]}
        onPick={(v) => set({ zoomOut: v === "on" })}
      />
      {zoomOut && (
        <Slider
          label="Duração"
          value={z.easeOut ?? z.ease ?? 0.6}
          min={0.1}
          max={3}
          step={0.05}
          format={(v) => `${v.toFixed(2)} s`}
          onCommit={(easeOut) => set({ easeOut })}
        />
      )}
      {!zoomOut && !next && (
        <p className="props-hint muted">
          Sem saída, o zoom fica até a camada acabar e então volta de uma vez. Para sair suave ou ir
          para outro ponto, use os botões abaixo.
        </p>
      )}

      {!next && (
        <div className="row-6 zoom-steps">
          <Button
            size="sm"
            icon={MoveRight}
            disabled={busy}
            onClick={() => void step("pan")}
            title="Uma nova camada logo depois desta, que leva o zoom até outro ponto sem voltar ao normal"
          >
            Continuar em outro ponto
          </Button>
          <Button
            size="sm"
            icon={Minimize2}
            disabled={busy}
            onClick={() => void step("restore")}
            title="Uma camada curta logo depois desta, que volta ao normal suavemente"
          >
            Voltar ao normal aqui
          </Button>
        </div>
      )}
    </div>
  );
}

/** Rail panel: add zoom layers, list them, and reach the recordings' automatic zoom. */
export function ZoomPanel({ onRecordingZoom }: { onRecordingZoom: () => void }): ReactNode {
  const project = useProject((s) => s.project);
  const time = usePlayback((s) => s.time);
  const [busy, setBusy] = useState(false);
  if (!project) return null;
  const layers = project.clips.filter((c) => c.zoomLayer).sort((a, b) => a.start - b.start);
  const clock = (s: number): string =>
    `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  return (
    <section className="library rail-panel">
      <div className="lib-header">
        <h2>
          <ZoomIn size={15} /> Zoom
        </h2>
      </div>
      <p className="muted ann-hint">
        A camada de zoom aproxima tudo que está nas faixas abaixo dela; entrada e saída suaves são
        opcionais, e dá para seguir de um ponto a outro sem sair do zoom. Ela entra numa faixa nova,
        no topo, no ponto do cursor ({clock(time)}); arraste-a para uma faixa mais baixa para deixar
        de fora o que fica acima.
      </p>
      <Button
        variant="primary"
        icon={Plus}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await addZoomLayer();
          useApp.getState().set({ sideTab: "properties" });
          setBusy(false);
        }}
      >
        Adicionar camada de zoom
      </Button>
      {layers.length > 0 && (
        <div className="zoom-layer-list">
          {layers.map((c) => (
            <button
              type="button"
              key={c.id}
              className="zoom-go"
              onClick={() => {
                useProject.getState().select([c.id]);
                playback.seek(c.start + 0.01);
                useApp.getState().set({ sideTab: "properties" });
              }}
            >
              <ZoomIn size={12} /> {clock(c.start)} a {clock(c.start + c.duration)} ·{" "}
              {c.zoomLayer!.scale < 1.01 ? "volta ao normal" : `${c.zoomLayer!.scale.toFixed(1)}×`}
            </button>
          ))}
        </div>
      )}
      <div className="props-section all-cuts">
        <h3>Zoom das gravações</h3>
        <p className="props-hint muted">
          Gravações feitas no EdiAula também têm zoom automático nos cliques, só da tela gravada.
        </p>
        <Button size="sm" icon={MousePointerClick} onClick={onRecordingZoom}>
          Zoom automático da gravação
        </Button>
      </div>
    </section>
  );
}
