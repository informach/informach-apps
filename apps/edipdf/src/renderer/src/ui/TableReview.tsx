import type { Box } from "@shared/model";
import type { TableEvidence } from "@shared/table-format";
import { useEffect, useRef, useState } from "react";

export function TableSourceImage({
  src,
  width,
  height,
  area,
  separators,
  highlight,
}: {
  src: string;
  width: number;
  height: number;
  area: Box;
  separators: number[];
  highlight?: Box | null;
}): React.ReactElement {
  const frame = useRef<HTMLElement>(null);
  useEffect(() => {
    const element = frame.current;
    if (!element || !highlight) return;
    const scale = element.clientWidth / width;
    element.scrollTo({
      top: Math.max(0, (highlight.y + highlight.h / 2) * scale - element.clientHeight / 2),
      left: 0,
    });
  }, [highlight, width]);
  return (
    <section
      ref={frame}
      className="table-source-scroll"
      aria-label="Conferência da região da tabela"
    >
      <svg
        className="table-source-image"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Página de origem com a região da tabela e as divisões de coluna"
      >
        <title>Página de origem; retângulo azul indica a região e linhas indicam as colunas</title>
        <image href={src} width={width} height={height} />
        <rect
          x={area.x}
          y={area.y}
          width={Math.max(0, area.w)}
          height={Math.max(0, area.h)}
          fill="var(--select)"
          fillOpacity="0.08"
          stroke="var(--accent)"
          strokeWidth="1.5"
        />
        {separators.map((x) => (
          <line
            key={x}
            x1={x}
            x2={x}
            y1={area.y}
            y2={area.y + area.h}
            stroke="var(--accent)"
            strokeWidth="1"
          />
        ))}
        {highlight && (
          <rect
            x={highlight.x}
            y={highlight.y}
            width={highlight.w}
            height={highlight.h}
            fill="var(--accent)"
            fillOpacity="0.25"
            stroke="var(--accent)"
            strokeWidth="1.5"
          />
        )}
      </svg>
    </section>
  );
}
export function TableReview({
  evidence,
  onHighlight,
}: {
  evidence: TableEvidence;
  onHighlight: (box: Box | null) => void;
}): React.ReactElement {
  const [start, setStart] = useState(0),
    size = 10;
  return (
    <section aria-label="Células extraídas">
      <p>
        Origem: página {evidence.source.page} · {evidence.rows.length} linhas. Selecione uma célula
        para localizar seu texto na página.
      </p>
      <div className="form-row">
        <button
          type="button"
          className="btn small"
          disabled={start === 0}
          onClick={() => setStart(Math.max(0, start - size))}
        >
          Linhas anteriores
        </button>
        <span role="status">
          Linhas {start + 1}–{Math.min(start + size, evidence.rows.length)} de{" "}
          {evidence.rows.length}
        </span>
        <button
          type="button"
          className="btn small"
          disabled={start + size >= evidence.rows.length}
          onClick={() => setStart(start + size)}
        >
          Próximas linhas
        </button>
      </div>
      <div className="table-review-scroll">
        <table className="table-review-grid">
          <caption>Valores literais da tabela; células que cruzam uma divisão têm aviso</caption>
          <tbody>
            {evidence.rows.slice(start, start + size).map((row, index) => (
              <tr key={row[0]?.address}>
                {row.map((cell, column) => (
                  <td key={cell.address}>
                    <button
                      type="button"
                      className="table-cell-evidence"
                      onClick={() => onHighlight(cell.box)}
                      onFocus={() => onHighlight(cell.box)}
                      aria-label={`Linha ${start + index + 1}, coluna ${column + 1}: ${cell.value || "vazia"}${cell.ambiguous ? "; cruza divisão, confira" : ""}`}
                    >
                      {cell.value || <span className="muted">vazia</span>}
                      {cell.ambiguous && <span className="error"> ⚠</span>}
                    </button>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small">
        SHA-256 da revisão: <span className="table-source-digest">{evidence.source.sha256}</span>.
        Geometria em pontos, a partir do canto superior esquerdo da página visível.
      </p>
    </section>
  );
}
