import { Crop, type LucideIcon, Palette, RotateCw, Sun, Type, WandSparkles } from "lucide-react";
import type { ReactNode } from "react";
import { actions, addText, attempt, quickAdjust } from "@/lib/actions";
import { openChromaKey } from "@/lib/chroma";
import { useUi } from "@/state/ui";

const ITEMS: {
  icon: LucideIcon;
  label: string;
  title: string;
  run: () => unknown;
  primary?: boolean;
}[] = [
  {
    icon: WandSparkles,
    label: "Auto-ajuste",
    title: "Corrige luz, contraste e cor numa camada de ajuste",
    run: actions.autoAdjust,
    primary: true,
  },
  { icon: Crop, label: "Cortar", title: "Cortar (C)", run: () => useUi.getState().setTool("crop") },
  { icon: RotateCw, label: "Girar", title: "Girar 90° à direita", run: actions.rotate },
  {
    icon: Sun,
    label: "Luz",
    title: "Exposição, contraste, realces e sombras",
    run: () => quickAdjust("light"),
  },
  {
    icon: Palette,
    label: "Cor",
    title: "Temperatura, saturação e matiz",
    run: () => quickAdjust("color"),
  },
  {
    icon: WandSparkles,
    label: "Remover fundo",
    title: "Chroma key com prévia, conta-gotas e refinamento de bordas",
    run: openChromaKey,
  },
  { icon: Type, label: "Texto", title: "Adicionar texto (T)", run: addText },
];

export function QuickDock(): ReactNode {
  return (
    <div className="dock" onPointerDown={(e) => e.stopPropagation()}>
      {ITEMS.map((it, i) => (
        <span key={it.label} style={{ display: "contents" }}>
          {i === 1 && <span className="vsep" />}
          <button
            type="button"
            className={`dock-btn${it.primary ? " is-primary" : ""}`}
            title={it.title}
            onClick={() => attempt(it.run)}
          >
            <it.icon size={15} />
            {it.label}
          </button>
        </span>
      ))}
    </div>
  );
}
