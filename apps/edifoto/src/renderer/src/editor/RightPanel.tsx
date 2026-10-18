import { type ReactNode, useState } from "react";
import { attempt } from "@/lib/actions";
import { setLayerProps } from "@/lib/ops";
import { useDoc } from "@/state/doc";
import { type PanelTab, useUi } from "@/state/ui";
import { Slider } from "@/ui/controls";
import { BlendSection } from "./BlendSection";
import { HistoryList } from "./HistoryList";
import { LayersFooter, LayersList } from "./LayersList";
import { Properties } from "./Properties";

const TABS: { id: PanelTab; label: string }[] = [
  { id: "layers", label: "Camadas" },
  { id: "props", label: "Propriedades" },
  { id: "history", label: "Histórico" },
];

export function RightPanel(): ReactNode {
  const tab = useUi((s) => s.tab);
  const tool = useUi((s) => s.tool);
  const vector = useDoc((s) => s.doc?.layers.find((l) => l.id === s.activeId)?.kind === "vector");
  const layer = useDoc((s) => s.doc?.layers.find((l) => l.id === s.activeId));
  const advanced = useUi((s) => s.advanced);
  const [blendOpen, setBlendOpen] = useState(false);
  return (
    <div className="rpanel">
      <div className="tabs">
        {TABS.map((t) => (
          <button
            type="button"
            key={t.id}
            className={`tab${tab === t.id ? " is-on" : ""}`}
            onClick={() => useUi.setState({ tab: t.id })}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "layers" && (
        <>
          <div className="panel-scroll">
            {vector && (tool === "pen" || tool === "shape") ? (
              <Properties />
            ) : advanced ? (
              <BlendSection />
            ) : (
              layer && (
                <div className="section quick-settings">
                  <div className="section-head">
                    <strong>{layer.name}</strong>
                    <button
                      type="button"
                      className="link"
                      onClick={() => useUi.setState({ tab: "props" })}
                    >
                      Editar item
                    </button>
                  </div>
                  <Slider
                    label="Opacidade"
                    value={Math.round(layer.opacity * 100)}
                    min={0}
                    max={100}
                    unit="%"
                    onChange={(value) =>
                      attempt(() => setLayerProps(layer.id, { opacity: value / 100 }))
                    }
                  />
                  <details onToggle={(event) => setBlendOpen(event.currentTarget.open)}>
                    <summary>Mesclagem e efeitos</summary>
                    {blendOpen && <BlendSection />}
                  </details>
                </div>
              )
            )}
            <LayersList />
          </div>
          <LayersFooter />
        </>
      )}
      {tab === "props" && (
        <div className="panel-scroll">
          <Properties />
        </div>
      )}
      {tab === "history" && (
        <div className="panel-scroll">
          <HistoryList />
        </div>
      )}
    </div>
  );
}
