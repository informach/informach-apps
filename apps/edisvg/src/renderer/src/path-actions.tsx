import { useId, useState } from "react";
import { createRoot } from "react-dom/client";
import type { PathEditCommand } from "../../shared/pathOperations";
import { CubicConversionPanel } from "./cubic-conversion-panel";
import { FormNumberField } from "./form-number-field";

interface Props {
  targetId: string;
  pathData: string;
  vertices: { contour: number; index: number }[];
  execute(command: PathEditCommand): void;
  report(message: string): void;
  locked: boolean;
}
function PathActions({ targetId, pathData, vertices, execute, report, locked }: Props) {
  const id = useId(),
    [tolerance, setTolerance] = useState(0.5),
    [confirmed, setConfirmed] = useState(false);
  const run = (command: PathEditCommand) => {
    try {
      execute(command);
    } catch (error) {
      report(error instanceof Error ? error.message : "Não foi possível editar o caminho.");
    }
  };
  return (
    <section>
      <fieldset disabled={locked}>
        <legend>OPERAÇÕES VETORIAIS · {vertices.length} pontos</legend>
        <div className="scene-tools">
          <button
            type="button"
            onClick={() => run({ type: "path-edit", targetId, operation: "delete", vertices })}
          >
            Excluir pontos selecionados
          </button>
          <button
            type="button"
            onClick={() => run({ type: "path-edit", targetId, operation: "smooth", vertices })}
          >
            Suavizar pontos
          </button>
          <button
            type="button"
            disabled={vertices.length !== 1}
            onClick={() => {
              const vertex = vertices[0];
              if (vertex) run({ type: "path-edit", targetId, operation: "split", vertex });
            }}
          >
            Separar no vértice
          </button>
          <button
            type="button"
            disabled={vertices.length !== 2}
            onClick={() => {
              const a = vertices[0],
                b = vertices[1];
              if (a && b) run({ type: "path-edit", targetId, operation: "join", vertices: [a, b] });
            }}
          >
            Unir extremidades
          </button>
        </div>
        <p className="micro">
          Shift/Ctrl + clique adiciona pontos. Arrastar move o conjunto com suas alças. União exige
          dois contornos abertos do mesmo caminho; extremidades distantes são conectadas por
          segmento reto.
        </p>
        <CubicConversionPanel targetId={targetId} pathData={pathData} run={run} />
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!confirmed) {
              report("Confirme a conversão das curvas em segmentos retos.");
              return;
            }
            run({ type: "path-edit", targetId, operation: "simplify", tolerance });
          }}
        >
          <label className="scene-field" htmlFor={id}>
            Tolerância em unidades locais
            <FormNumberField
              id={id}
              label="Tolerância da simplificação"
              min=".01"
              max="1000"
              value={tolerance}
              change={(raw) => setTolerance(Number(raw))}
            />
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            <span>Converter curvas em segmentos retos</span>
          </label>
          <button type="submit" disabled={!confirmed}>
            Simplificar caminho
          </button>
          <p className="micro">
            Conversão aproximada explícita, limitada por tolerância e orçamento de trabalho. Pode
            ser desfeita; o original do arquivo não é sobrescrito até salvar.
          </p>
        </form>
      </fieldset>
    </section>
  );
}
export function mountPathActions(host: Element, props: Props) {
  const root = createRoot(host);
  root.render(<PathActions {...props} />);
  return () => root.unmount();
}
