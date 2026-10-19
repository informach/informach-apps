import { useRef, useState } from "react";

export function ReviewImage({
  src,
  alt,
  limited = false,
  grayscale = false,
}: {
  src: string;
  alt: string;
  limited?: boolean;
  grayscale?: boolean;
}): React.ReactElement {
  const [view, setView] = useState<"page" | "width" | "detail">("page"),
    frame = useRef<HTMLElement>(null);
  return (
    <div className="review-image">
      <fieldset className="review-image-controls">
        <legend>Ampliação da prévia</legend>
        <button
          type="button"
          className="btn ghost small"
          aria-pressed={view === "page"}
          onClick={() => setView("page")}
        >
          Página inteira
        </button>
        <button
          type="button"
          className="btn ghost small"
          aria-pressed={view === "width"}
          onClick={() => setView("width")}
        >
          Largura
        </button>
        <button
          type="button"
          className="btn ghost small"
          aria-pressed={view === "detail"}
          onClick={() => setView("detail")}
        >
          150%
        </button>
        {limited && <span className="muted small">Prévia reduzida para exibição.</span>}
      </fieldset>
      <section
        className={`review-image-frame ${view}`}
        ref={frame}
        aria-label="Área da prévia; use as barras de rolagem para conferir os detalhes"
      >
        <img
          src={src}
          alt={alt}
          onLoad={() => frame.current?.scrollTo({ left: 0, top: 0 })}
          style={{ filter: grayscale ? "grayscale(1)" : undefined }}
        />
      </section>
    </div>
  );
}
