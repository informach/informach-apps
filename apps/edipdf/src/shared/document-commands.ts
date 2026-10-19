import { z } from "zod";
import { annotationSchema, contentSchema } from "./document-format.ts";
import { type DocContent, uid } from "./model.ts";

const ids = z.array(z.string().min(1).max(160)).min(1).max(100000);
const commandSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("pages.delete"), ids }),
  z.strictObject({ type: z.literal("pages.duplicate"), ids }),
  z.strictObject({ type: z.literal("pages.move"), ids, to: z.number().int().nonnegative() }),
  z.strictObject({
    type: z.literal("annotations.add"),
    annotations: z.array(annotationSchema).min(1),
  }),
  z.strictObject({ type: z.literal("annotations.delete"), ids }),
  z.strictObject({
    type: z.literal("metadata.set"),
    metadata: z.object({
      title: z.string().max(100000).optional(),
      author: z.string().max(100000).optional(),
      subject: z.string().max(100000).optional(),
      keywords: z.string().max(100000).optional(),
    }),
  }),
]);
export type DocumentCommand = z.infer<typeof commandSchema>;
export function validateDocumentRevision(
  content: DocContent,
  previous: DocContent,
  sourceIds: Iterable<string>,
): DocContent {
  const next = contentSchema.parse(content);
  const sources = new Set(sourceIds);
  if (next.baseSource && !sources.has(next.baseSource))
    throw new Error("Fonte da revisão indisponível.");
  if (next.pages.some((page) => !page.blank && !sources.has(page.src)))
    throw new Error("Fonte de página indisponível.");
  return {
    ...next,
    pages: content.pages === previous.pages ? previous.pages : next.pages,
    annots: content.annots === previous.annots ? previous.annots : next.annots,
    forms: content.forms === previous.forms ? previous.forms : next.forms,
    meta: content.meta === previous.meta ? previous.meta : next.meta,
    watermark: content.watermark === previous.watermark ? previous.watermark : next.watermark,
    pageNumbers:
      content.pageNumbers === previous.pageNumbers ? previous.pageNumbers : next.pageNumbers,
  };
}

/** Validate the complete batch before publishing a new immutable document revision. */
export function executeDocumentTransaction(content: DocContent, raw: unknown): DocContent {
  const commands = z.array(commandSchema).min(1).max(10000).parse(raw);
  let next = content;
  for (const command of commands) {
    switch (command.type) {
      case "pages.delete": {
        const set = new Set(command.ids);
        if (command.ids.some((id) => !next.pages.some((p) => p.id === id)))
          throw new Error("Página inexistente.");
        if (next.pages.every((p) => set.has(p.id)))
          throw new Error("O documento precisa ter pelo menos uma página.");
        next = {
          ...next,
          pages: next.pages.filter((p) => !set.has(p.id)),
          annots: next.annots.filter((a) => !set.has(a.page)),
        };
        break;
      }
      case "pages.duplicate": {
        if (command.ids.some((id) => !next.pages.some((p) => p.id === id)))
          throw new Error("Página inexistente.");
        const set = new Set(command.ids),
          pages: DocContent["pages"] = [],
          annots = [...next.annots];
        for (const page of next.pages) {
          pages.push(page);
          if (!set.has(page.id)) continue;
          const clone = { ...page, id: uid("p") };
          pages.push(clone);
          for (const a of next.annots)
            if (a.page === page.id) annots.push({ ...a, id: uid("a"), page: clone.id });
        }
        next = { ...next, pages, annots };
        break;
      }
      case "pages.move": {
        if (
          command.to > next.pages.length ||
          command.ids.some((id) => !next.pages.some((p) => p.id === id))
        )
          throw new Error("Destino de páginas inválido.");
        const set = new Set(command.ids),
          moving = next.pages.filter((p) => set.has(p.id));
        const pages = [
          ...next.pages.slice(0, command.to).filter((p) => !set.has(p.id)),
          ...moving,
          ...next.pages.slice(command.to).filter((p) => !set.has(p.id)),
        ];
        if (pages.some((page, i) => page !== next.pages[i])) next = { ...next, pages };
        break;
      }
      case "annotations.add":
        next = { ...next, annots: [...next.annots, ...command.annotations] };
        break;
      case "annotations.delete":
        next = { ...next, annots: next.annots.filter((a) => !command.ids.includes(a.id)) };
        break;
      case "metadata.set":
        next = { ...next, meta: { ...next.meta, ...command.metadata } };
        break;
    }
  }
  contentSchema.parse(next);
  return next;
}
