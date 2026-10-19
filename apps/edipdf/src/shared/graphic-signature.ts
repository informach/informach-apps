import { type Annot, type Box, uid } from "./model.ts";
import { signatureSchema } from "./preferences.ts";
import type { SavedSignature } from "./types.ts";

export interface SignaturePlacement {
  centerX: number;
  centerY: number;
  width: number;
}

export function signatureLayout(
  signature: Pick<SavedSignature, "width" | "height">,
  pageSize: { w: number; h: number },
  date?: string,
  placement?: SignaturePlacement,
): { box: Box; dateBox?: Box; dateSize: number; scale: number } {
  if (
    ![pageSize.w, pageSize.h, signature.width, signature.height].every(
      (value) => Number.isFinite(value) && value > 0,
    ) ||
    pageSize.w <= 8 ||
    pageSize.h <= 8
  )
    throw new Error("A página não tem espaço útil para a assinatura.");
  if (
    placement &&
    (![placement.centerX, placement.centerY, placement.width].every(Number.isFinite) ||
      placement.width <= 0)
  )
    throw new Error("Informe uma posição e uma largura válidas para a assinatura.");
  if (date && (date.length > 100 || /[\r\n]/.test(date)))
    throw new Error("A data da assinatura precisa ocupar uma única linha curta.");
  const availableW = pageSize.w - 8,
    availableH = pageSize.h - 8,
    dateSize = date ? Math.min(10, availableW / date.length, (availableH - 5) / 1.2) : 0,
    dateHeight = date ? dateSize * 1.2 + 5 : 0;
  if (date && dateSize <= 0) throw new Error("A página não tem espaço para a assinatura e a data.");
  const scale = Math.min(
    placement ? placement.width / signature.width : Math.min(0.75, 170 / signature.width),
    (placement ? availableW : Math.min(availableW, pageSize.w * 0.85)) / signature.width,
    (placement ? availableH - dateHeight : Math.min(availableH - dateHeight, pageSize.h * 0.6)) /
      signature.height,
  );
  if (scale <= 0) throw new Error("A página não tem espaço para a assinatura e a data.");
  const width = signature.width * scale,
    height = signature.height * scale,
    groupWidth = Math.max(width, date ? date.length * dateSize : 0),
    groupHeight = height + dateHeight,
    left = Math.max(
      4,
      Math.min(
        pageSize.w - 4 - groupWidth,
        (placement?.centerX ?? pageSize.w / 2) - groupWidth / 2,
      ),
    ),
    top = Math.max(
      4,
      Math.min(
        pageSize.h - 4 - groupHeight,
        (placement?.centerY ?? pageSize.h / 2) - groupHeight / 2,
      ),
    );
  return {
    box: { x: left + (groupWidth - width) / 2, y: top, w: width, h: height },
    dateBox: date
      ? {
          x: left + (groupWidth - date.length * dateSize) / 2,
          y: top + height + 5,
          w: date.length * dateSize,
          h: dateSize * 1.2,
        }
      : undefined,
    dateSize,
    scale,
  };
}

export function signatureAnnotations(
  raw: SavedSignature,
  page: string,
  pageSize: { w: number; h: number },
  date?: string,
  placement?: SignaturePlacement,
): Annot[] {
  const signature = signatureSchema.parse(raw),
    group = uid("signature"),
    layout = signatureLayout(signature, pageSize, date, placement),
    { box, scale: k } = layout;
  const annots: Annot[] = signature.strokes
    ? signature.strokes.map((stroke) => ({
        id: uid("a"),
        page,
        group,
        kind: "ink",
        paths: [stroke.points.map((point, index) => point * k + (index % 2 ? box.y : box.x))],
        stroke: stroke.color,
        width: stroke.width * k,
        signature: true,
      }))
    : [{ id: uid("a"), page, group, kind: "image", ...box, src: signature.src, signature: true }];
  if (date && layout.dateBox)
    annots.push({
      id: uid("a"),
      page,
      group,
      kind: "text",
      x: layout.dateBox.x,
      y: layout.dateBox.y,
      text: date,
      font: "helvetica",
      size: layout.dateSize,
      color: "#111111",
    });
  return annots;
}
export function rotatedSignatureGeometry(
  signature: SavedSignature,
  rotation: 0 | 90 | 180 | 270,
): Pick<SavedSignature, "width" | "height" | "strokes"> {
  const swap = rotation % 180 !== 0;
  return {
    width: swap ? signature.height : signature.width,
    height: swap ? signature.width : signature.height,
    strokes: signature.strokes?.map((stroke) => {
      const points: number[] = [];
      for (let index = 0; index < stroke.points.length; index += 2) {
        const x = stroke.points[index],
          y = stroke.points[index + 1];
        points.push(
          ...(rotation === 90
            ? [signature.height - y, x]
            : rotation === 180
              ? [signature.width - x, signature.height - y]
              : rotation === 270
                ? [y, signature.width - x]
                : [x, y]),
        );
      }
      return { ...stroke, points };
    }),
  };
}
