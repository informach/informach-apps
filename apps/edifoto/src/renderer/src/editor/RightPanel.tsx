import type { ReactNode } from "react";
import { useDoc } from "@/state/doc";
import { type PanelTab, useUi } from "@/state/ui";
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
            {vector && (tool === "pen" || tool === "shape") ? <Properties /> : <BlendSection />}
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
