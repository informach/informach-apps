import { type Box, type PageRef, totalRotation } from "@shared/model";
import { webUrlSchema } from "@shared/pdf-navigation";
import { useEffect, useState } from "react";
import { z } from "zod";
import { getSource, pageInfo } from "../lib/pdf";
import { type DocState, toast } from "../state/store";
import { scrollToPage } from "./Viewer";

const linkSchema = z.object({
  id: z.string(),
  subtype: z.literal("Link"),
  rect: z.tuple([
    z.number().finite(),
    z.number().finite(),
    z.number().finite(),
    z.number().finite(),
  ]),
  url: z.string().nullable().optional(),
  dest: z
    .union([z.string(), z.array(z.unknown())])
    .nullable()
    .optional(),
});
export async function destinationIndex(
  sourceId: string,
  raw: unknown,
): Promise<number | undefined> {
  const source = getSource(sourceId);
  if (!source) throw new Error("Fonte do link indisponível.");
  const destination: unknown = typeof raw === "string" ? await source.pdf.getDestination(raw) : raw;
  if (!Array.isArray(destination)) return undefined;
  const first: unknown = destination[0];
  if (
    typeof first === "number" &&
    Number.isInteger(first) &&
    first >= 0 &&
    first < source.info.length
  )
    return first;
  const reference = z
    .object({ num: z.number().int().nonnegative(), gen: z.number().int().nonnegative() })
    .safeParse(first);
  if (reference.success) return source.pdf.getPageIndex(reference.data);
  return undefined;
}
interface LinkView {
  id: string;
  box: Box;
  url?: string;
  dest?: string | unknown[] | null;
}
export function LinkLayer({
  doc,
  page,
  scale,
}: {
  doc: DocState;
  page: PageRef;
  scale: number;
}): React.ReactElement {
  const [links, setLinks] = useState<LinkView[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    setLinks([]);
    setError("");
    void (async () => {
      if (page.blank) return;
      const source = getSource(page.src);
      if (!source) throw new Error("Fonte dos links indisponível.");
      const proxy = await source.pdf.getPage(page.index + 1),
        viewport = proxy.getViewport({ scale: 1, rotation: totalRotation(page, pageInfo(page)) });
      const values: LinkView[] = [];
      for (const raw of await proxy.getAnnotations()) {
        const parsed = linkSchema.safeParse(raw);
        if (!parsed.success) continue;
        const link = parsed.data,
          [x1, y1] = viewport.convertToViewportPoint(link.rect[0], link.rect[1]),
          [x2, y2] = viewport.convertToViewportPoint(link.rect[2], link.rect[3]);
        const url = webUrlSchema.safeParse(link.url);
        if (!url.success && !link.dest) continue;
        values.push({
          id: link.id,
          box: {
            x: Math.min(x1, x2),
            y: Math.min(y1, y2),
            w: Math.abs(x2 - x1),
            h: Math.abs(y2 - y1),
          },
          url: url.success ? url.data : undefined,
          dest: link.dest,
        });
      }
      if (live) setLinks(values);
    })().catch((failure) => {
      if (live) setError(failure instanceof Error ? failure.message : "Links indisponíveis.");
    });
    return () => {
      live = false;
    };
  }, [page]);
  return (
    <div className="link-layer">
      {error && (
        <span className="page-warning" role="alert">
          {error}
        </span>
      )}
      {links.map((link, index) => (
        <button
          type="button"
          className="pdf-link"
          key={link.id}
          style={{
            left: link.box.x * scale,
            top: link.box.y * scale,
            width: link.box.w * scale,
            height: link.box.h * scale,
          }}
          title={link.url ?? "Ir ao destino do link"}
          aria-label={link.url ? `Abrir link: ${link.url}` : `Ir ao destino do link ${index + 1}`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={async (event) => {
            event.stopPropagation();
            try {
              if (link.url) await window.api.openWebLink(link.url);
              else {
                const target = await destinationIndex(page.src, link.dest),
                  index = doc.content.pages.findIndex(
                    (ref) => ref.src === page.src && ref.index === target,
                  );
                if (index < 0) throw new Error("O destino deste link não está mais no documento.");
                scrollToPage(doc.id, index);
              }
            } catch (failure) {
              toast(failure instanceof Error ? failure.message : "Não foi possível abrir o link.", {
                tone: "error",
              });
            }
          }}
        />
      ))}
    </div>
  );
}
