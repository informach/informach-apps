import type { SignaturePlacement } from "@shared/graphic-signature";
import { viewSize } from "@shared/model";
import { useEffect, useState } from "react";
import { buildDoc } from "../lib/document-output";
import { loadSource, pageInfo, releaseSource, renderReviewPage } from "../lib/pdf";
import type { DocState } from "../state/store";

export function SignaturePositionPicker({
  doc,
  placement,
  onChange,
}: {
  doc: DocState;
  placement: SignaturePlacement;
  onChange(value: SignaturePlacement): void;
}): React.ReactElement {
  const [preview, setPreview] = useState<string>(),
    [error, setError] = useState("");
  const page = doc.content.pages[doc.currentPage],
    size = viewSize(page, pageInfo(page));
  useEffect(() => {
    const abort = new AbortController();
    let sourceId: string | undefined;
    void (async () => {
      const bytes = await buildDoc(doc, doc.content, abort.signal);
      abort.signal.throwIfAborted();
      const source = await loadSource(
        bytes,
        "Posição da assinatura.pdf",
        () => Promise.resolve(null),
        { output: true },
      );
      if (!source) throw new Error("Não foi possível preparar a página da assinatura.");
      sourceId = source.id;
      abort.signal.throwIfAborted();
      const image = await renderReviewPage(
        { id: "signature-position", src: source.id, index: doc.currentPage, rotation: 0 },
        900,
        abort.signal,
      );
      abort.signal.throwIfAborted();
      setPreview(image.url);
    })()
      .catch((failure: unknown) => {
        if (!abort.signal.aborted)
          setError(
            failure instanceof Error ? failure.message : "Não foi possível preparar a página.",
          );
      })
      .finally(() => {
        if (sourceId) releaseSource(sourceId);
      });
    return () => abort.abort();
  }, [doc]);
  return (
    <div>
      <p className="muted small">
        Clique no centro desejado. As setas movem o ponto; Shift move dez pontos. A assinatura e a
        data são ajustadas para caber na página.
      </p>
      {error ? (
        <p role="alert" className="error-text">
          {error}
        </p>
      ) : preview ? (
        <button
          type="button"
          aria-label="Escolher o centro da assinatura na página"
          className="signature-position-picker"
          style={{
            width: `min(100%, ${Math.min(360, (300 * size.w) / size.h)}px)`,
            aspectRatio: `${size.w} / ${size.h}`,
          }}
          onClick={(event) => {
            if (event.detail === 0) return;
            const rect = event.currentTarget.getBoundingClientRect();
            onChange({
              ...placement,
              centerX: Math.max(
                0,
                Math.min(size.w, ((event.clientX - rect.left) / rect.width) * size.w),
              ),
              centerY: Math.max(
                0,
                Math.min(size.h, ((event.clientY - rect.top) / rect.height) * size.h),
              ),
            });
          }}
          onKeyDown={(event) => {
            if (!event.key.startsWith("Arrow")) return;
            event.preventDefault();
            event.stopPropagation();
            const amount = event.shiftKey ? 10 : 1;
            onChange({
              ...placement,
              centerX: Math.max(
                0,
                Math.min(
                  size.w,
                  placement.centerX +
                    (event.key === "ArrowLeft" ? -amount : event.key === "ArrowRight" ? amount : 0),
                ),
              ),
              centerY: Math.max(
                0,
                Math.min(
                  size.h,
                  placement.centerY +
                    (event.key === "ArrowUp" ? -amount : event.key === "ArrowDown" ? amount : 0),
                ),
              ),
            });
          }}
        >
          <img src={preview} alt="Página atual para escolher a posição da assinatura" />
          <span
            aria-hidden="true"
            style={{
              left: `${(placement.centerX / size.w) * 100}%`,
              top: `${(placement.centerY / size.h) * 100}%`,
            }}
          >
            +
          </span>
        </button>
      ) : (
        <p role="status">Preparando a página para posicionar…</p>
      )}
      <p className="muted small" role="status">
        Centro solicitado: {placement.centerX.toFixed(1)}, {placement.centerY.toFixed(1)} pontos.
      </p>
    </div>
  );
}
