import { useId, useState } from "react";
import { createRoot } from "react-dom/client";
import { FormNumberField } from "./form-number-field";
import type { TransformUpdate } from "./selectionGestures";
import {
  type AlignOperation,
  alignmentOperation,
  alignSelection,
  measureSelection,
} from "./selectionLayout";

interface Props {
  svg: SVGSVGElement;
  state: Parameters<typeof measureSelection>[1] & { snapGrid?: number };
  ids: string[];
  execute(updates: TransformUpdate[]): void;
  render(): void;
  report(message: string): void;
}
function TransformActions({
  svg,
  state,
  ids,
  execute,
  render,
  report,
  initialWorld,
}: Props & { initialWorld: { x: number; y: number } | null }) {
  const fieldId = useId();
  const [grid, setGrid] = useState(state.snapGrid ?? 0),
    [world, setWorld] = useState(initialWorld);
  const run = (action: () => TransformUpdate[]) => {
    try {
      execute(action());
      render();
    } catch (error) {
      report(error instanceof Error ? error.message : "Não foi possível transformar.");
    }
  };
  const labels: Record<AlignOperation, string> = {
    left: "Esquerda",
    "center-x": "Centro X",
    right: "Direita",
    top: "Topo",
    "center-y": "Centro Y",
    bottom: "Base",
    "distribute-x": "Distribuir X",
    "distribute-y": "Distribuir Y",
  };
  return (
    <section>
      <h3>ORGANIZAR SELEÇÃO</h3>
      <div className="scene-tools">
        {Object.entries(labels).map(([operation, label]) => (
          <button
            type="button"
            key={operation}
            disabled={ids.length < 2}
            onClick={() =>
              run(() => alignSelection(svg, state, ids, alignmentOperation(operation)))
            }
          >
            {label}
          </button>
        ))}
      </div>
      <div className="scene-tools">
        {["sx", "sy"].map((axis) => (
          <button
            type="button"
            key={axis}
            onClick={() =>
              run(() =>
                measureSelection(svg, state, ids).map((item) => ({
                  targetId: item.entry.node.id,
                  transform: axis === "sx" ? { sx: -item.pose.sx } : { sy: -item.pose.sy },
                })),
              )
            }
          >
            Espelhar {axis === "sx" ? "X" : "Y"}
          </button>
        ))}
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (Number.isFinite(grid) && (grid === 0 || grid >= 0.1) && grid <= 10000) {
            state.snapGrid = grid;
            render();
          } else report("Use 0 para desligar ou grade entre 0,1 e 10000.");
        }}
      >
        <label className="scene-field" htmlFor={`${fieldId}-grid`}>
          Grade de encaixe (0 desliga)
          <FormNumberField
            id={`${fieldId}-grid`}
            label="Grade de encaixe (0 desliga)"
            value={grid}
            change={(raw) => setGrid(Number(raw))}
            min="0"
            max="10000"
          />
        </label>
        <button type="submit">Aplicar grade</button>
      </form>
      {world && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            run(() => {
              const item = measureSelection(svg, state, ids.slice(-1))[0];
              if (!item) throw new Error("Selecione um objeto.");
              const px = item.pose.px ?? 0,
                py = item.pose.py ?? 0,
                x = item.matrix[0] * px + item.matrix[2] * py + item.matrix[4],
                y = item.matrix[1] * px + item.matrix[3] * py + item.matrix[5],
                dx = world.x - x,
                dy = world.y - y,
                m = item.toParent;
              return [
                {
                  targetId: item.entry.node.id,
                  transform: {
                    x: item.pose.x + m[0] * dx + m[2] * dy,
                    y: item.pose.y + m[1] * dx + m[3] * dy,
                  },
                },
              ];
            });
          }}
        >
          <h3>PIVÔ NO ESPAÇO GLOBAL</h3>
          <label className="scene-field" htmlFor={`${fieldId}-x`}>
            X global
            <FormNumberField
              id={`${fieldId}-x`}
              label="X global"
              value={world.x}
              change={(raw) => setWorld({ ...world, x: Number(raw) })}
              min="-1000000"
              max="1000000"
            />
          </label>
          <label className="scene-field" htmlFor={`${fieldId}-y`}>
            Y global
            <FormNumberField
              id={`${fieldId}-y`}
              label="Y global"
              value={world.y}
              change={(raw) => setWorld({ ...world, y: Number(raw) })}
              min="-1000000"
              max="1000000"
            />
          </label>
          <button type="submit">Aplicar posição global</button>
        </form>
      )}
      <p className="micro">
        Alinhamento usa os limites visuais no espaço da prancheta. Transformações locais ficam
        acima; a posição global é a do pivô do objeto principal. Distribuir equilibra os espaços,
        não as larguras.
      </p>
    </section>
  );
}
export function mountTransformActions(host: Element, props: Props) {
  let world: { x: number; y: number } | null = null;
  try {
    const item = measureSelection(props.svg, props.state, props.ids.slice(-1))[0];
    if (item) {
      const px = item.pose.px ?? 0,
        py = item.pose.py ?? 0;
      world = {
        x: item.matrix[0] * px + item.matrix[2] * py + item.matrix[4],
        y: item.matrix[1] * px + item.matrix[3] * py + item.matrix[5],
      };
    }
  } catch (error) {
    props.report(error instanceof Error ? error.message : "Coordenadas indisponíveis.");
  }
  const root = createRoot(host);
  root.render(<TransformActions {...props} initialWorld={world} />);
  return () => root.unmount();
}
