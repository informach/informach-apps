import { useEffect, useId, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { z } from "zod";
import { booleanOperationSchema } from "../../shared/vectorBoolean";
import { FormNumberField } from "./form-number-field";

interface Props {
  ids: string[];
  firstName: string;
  available: boolean;
  execute(command: unknown, signal: AbortSignal): Promise<void>;
  report(message: string): void;
}
function VectorActions({ ids, firstName, available, execute, report }: Props) {
  const id = useId(),
    [operation, setOperation] = useState<z.infer<typeof booleanOperationSchema>>("union"),
    [tolerance, setTolerance] = useState(0.5),
    [approximate, setApproximate] = useState(false),
    [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [errorMessage, setErrorMessage] = useState(""),
    controller = useRef<AbortController | null>(null),
    live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      controller.current?.abort();
    };
  }, []);
  return (
    <section>
      <h3>OPERAÇÕES BOOLEANAS</h3>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (!consent || !available || busy || controller.current) return;
          const task = new AbortController();
          controller.current = task;
          setBusy(true);
          setErrorMessage("");
          try {
            await execute(
              {
                type: "vector-boolean",
                operation,
                targetIds: ids,
                tolerance,
                approximateCurves: approximate,
                useFirstAppearance: true,
              },
              task.signal,
            );
          } catch (error) {
            if (live.current) {
              const message = error instanceof Error ? error.message : "Cálculo recusado.";
              setErrorMessage(message);
              report(message);
            }
          } finally {
            if (live.current) {
              setBusy(false);
              controller.current = null;
            }
          }
        }}
      >
        <fieldset disabled={!available || busy}>
          <label className="scene-field">
            Operação
            <select
              name="boolean-operation"
              aria-label="Operação booleana"
              value={operation}
              onChange={(event) => setOperation(booleanOperationSchema.parse(event.target.value))}
            >
              <option value="union">União</option>
              <option value="intersection">Interseção</option>
              <option value="difference">Primeiro menos demais</option>
              <option value="xor">Diferença simétrica</option>
            </select>
          </label>
          <label className="scene-field" htmlFor={id}>
            Tolerância na geometria Bézier local
            <FormNumberField
              id={id}
              label="Tolerância booleana"
              min=".01"
              max="100"
              value={tolerance}
              change={(raw) => setTolerance(Number(raw))}
            />
          </label>
          <label className="check-row">
            <input
              name="approximate-curves"
              type="checkbox"
              checked={approximate}
              onChange={(event) => setApproximate(event.target.checked)}
            />
            <span>Aproximar curvas por segmentos retos</span>
          </label>
          <label className="check-row">
            <input
              name="appearance-consent"
              type="checkbox"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
            />
            <span>
              Usar aparência e animação de “{firstName}”; remover os demais objetos e suas trilhas
            </span>
          </label>
          <button type="submit" disabled={!consent}>
            Calcular booleana
          </button>
        </fieldset>
        <p role="status">{errorMessage}</p>
        {busy && (
          <>
            <p role="status">Calculando fora da interface. Nenhuma alteração foi aplicada ainda.</p>
            <button type="button" onClick={() => controller.current?.abort()}>
              Cancelar cálculo
            </button>
          </>
        )}
        <p className="micro">
          Use 2–16 formas do mesmo grupo no Design. Área geométrica dos contornos: strokes não são
          expandidos. Curvas exigem conversão explícita; arcos/formas arredondadas usam a conversão
          Bézier anterior à poligonalização. Limites: 2000 vértices/32 contornos de entrada, 10000
          de saída, 10 segundos. Auto-interseções são recusadas. Resultado vazio remove a seleção;
          tudo é uma edição reversível.
        </p>
      </form>
    </section>
  );
}
export function mountVectorActions(host: Element, props: Props) {
  const root = createRoot(host);
  root.render(<VectorActions {...props} />);
  return () => root.unmount();
}
