import { useMemo, useState } from "react";
import { prepareCubicConversion } from "../../shared/cubicConversion";
import type { PathEditCommand } from "../../shared/pathOperations";

interface Props {
  targetId: string;
  pathData: string;
  run(command: PathEditCommand): void;
}

function inspect(pathData: string) {
  try {
    return { result: prepareCubicConversion(pathData), error: null };
  } catch (error) {
    return {
      result: null,
      error: error instanceof Error ? error.message : "Não foi possível preparar a conversão.",
    };
  }
}

export function CubicConversionPanel({ targetId, pathData, run }: Props) {
  const prepared = useMemo(() => inspect(pathData), [pathData]),
    [confirmed, setConfirmed] = useState(false),
    result = prepared.result;
  return (
    <fieldset className="cubic-conversion">
      <legend>BÉZIER CÚBICA EXPLÍCITA</legend>
      {result ? (
        <>
          <div className="cubic-previews">
            {[
              { label: "Antes", d: pathData },
              { label: "Depois", d: result.pathData },
            ].map(({ label, d }) => (
              <figure key={label}>
                <svg
                  role="img"
                  aria-label={`Geometria ${label.toLowerCase()} da conversão`}
                  viewBox={result.preview.viewBox}
                >
                  <path
                    d={d}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={result.preview.strokeWidth}
                  />
                </svg>
                <figcaption>{label}</figcaption>
              </figure>
            ))}
          </div>
          <p className="micro">
            Prévia de geometria; não inclui aparência final, efeitos ou transformações. Bordas podem
            mudar; arcos usam a aproximação cúbica do editor, com coordenadas arredondadas a seis
            casas decimais. Dependências incompatíveis impedem a conversão.
          </p>
          <label className="check-row">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
              disabled={!result.changed}
            />
            <span>Confirmo a conversão e possíveis mudanças na aparência</span>
          </label>
          <button
            type="button"
            disabled={!confirmed || !result.changed}
            onClick={() =>
              run({
                type: "path-edit",
                targetId,
                operation: "cubicize",
                confirmAppearanceChange: true,
              })
            }
          >
            Converter caminho para Bézier cúbica
          </button>
          <p className="micro">
            {result.changed
              ? `${result.segments} segmentos; ${result.addedHandles} alças acrescentadas. Uma edição reversível; o arquivo só muda ao salvar.`
              : "O caminho já usa a representação cúbica canônica."}
          </p>
        </>
      ) : (
        <p role="alert" className="micro">
          {prepared.error}
        </p>
      )}
    </fieldset>
  );
}
