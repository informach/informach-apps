import { z } from "zod";
import { annotationSchema, contentSchema } from "./document-format.ts";
import {
  type Annot,
  annotBounds,
  type Box,
  type DocContent,
  translateAnnot,
  uid,
} from "./model.ts";

const ids = z
  .array(z.string().min(1))
  .min(1)
  .max(10000)
  .refine((ids) => new Set(ids).size === ids.length);

/** Alt picks an individual member without changing its group; Shift toggles the picked unit. */
export function pickAnnotationSelection(
  annotations: Annot[],
  id: string,
  previous: string[],
  options: { additive: boolean; insideGroup: boolean },
): string[] {
  const annotation = annotations.find((item) => item.id === id);
  if (!annotation) return [];
  const picked = annotations
    .filter(
      (item) =>
        item.id === id ||
        (!options.insideGroup &&
          annotation.group &&
          item.group === annotation.group &&
          item.page === annotation.page),
    )
    .map((item) => item.id);
  const valid = new Set(annotations.map((item) => item.id)),
    selection = [...new Set(previous)].filter((item) => valid.has(item));
  if (options.additive)
    return selection.includes(id)
      ? selection.filter((item) => !picked.includes(item))
      : [...new Set([...selection, ...picked])];
  if (options.insideGroup) return [id];
  return selection.includes(id) && picked.every((item) => selection.includes(item))
    ? selection
    : picked;
}
export const annotationCommandSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.enum([
      "delete",
      "duplicate",
      "group",
      "ungroup",
      "lock",
      "unlock",
      "front",
      "back",
      "forward",
      "backward",
    ]),
    ids,
  }),
  z.object({
    kind: z.literal("move"),
    ids,
    dx: z.number().finite().min(-1e7).max(1e7),
    dy: z.number().finite().min(-1e7).max(1e7),
  }),
  z.object({
    kind: z.literal("align"),
    ids,
    axis: z.enum(["left", "center", "right", "top", "middle", "bottom"]),
    bounds: z.record(
      z.string(),
      z.object({
        x: z.number().finite(),
        y: z.number().finite(),
        w: z.number().nonnegative(),
        h: z.number().nonnegative(),
      }),
    ),
  }),
  z.object({
    kind: z.literal("paste"),
    page: z.string(),
    annotations: z.array(annotationSchema).min(1).max(10000),
  }),
]);
export type AnnotationCommand = z.infer<typeof annotationCommandSchema>;
function copies(annotations: Annot[], page?: string): Annot[] {
  const groups = new Map<string, string>();
  return annotations.map((annot) => {
    if (annot.group && !groups.has(annot.group)) groups.set(annot.group, uid("group"));
    return {
      ...translateAnnot(annot, 12, 12),
      id: uid("a"),
      page: page ?? annot.page,
      locked: false,
      group: annot.group ? groups.get(annot.group) : undefined,
    };
  });
}
/** Atomic editing commands; locked items must be explicitly unlocked before changing them. */
export function applyAnnotationCommand(
  content: DocContent,
  raw: AnnotationCommand,
): { content: DocContent; selection: string[] } {
  const command = annotationCommandSchema.parse(raw);
  if (command.kind === "paste") {
    if (!content.pages.some((page) => page.id === command.page))
      throw new Error("Página de colagem indisponível.");
    const added = copies(command.annotations, command.page),
      next = { ...content, annots: [...content.annots, ...added] };
    contentSchema.parse(next);
    return { content: next, selection: added.map((annot) => annot.id) };
  }
  const selected = content.annots.filter((annot) => command.ids.includes(annot.id));
  if (selected.length !== command.ids.length) throw new Error("A seleção de anotações mudou.");
  if (
    !["unlock", "lock", "duplicate"].includes(command.kind) &&
    selected.some((annot) => annot.locked)
  )
    throw new Error("Desbloqueie as anotações selecionadas antes de alterar.");
  const set = new Set(command.ids),
    map = (operation: (annot: Annot) => Annot) =>
      content.annots.map((annot) => (set.has(annot.id) ? operation(annot) : annot));
  let annots = content.annots,
    selection = command.ids;
  switch (command.kind) {
    case "delete":
      annots = annots.filter((annot) => !set.has(annot.id));
      selection = [];
      break;
    case "duplicate": {
      const added = copies(selected);
      annots = [...annots, ...added];
      selection = added.map((annot) => annot.id);
      break;
    }
    case "lock":
    case "unlock":
      annots = map((annot) => ({ ...annot, locked: command.kind === "lock" }));
      break;
    case "group": {
      const group = uid("group");
      if (new Set(selected.map((annot) => annot.page)).size > 1)
        throw new Error("Agrupe anotações da mesma página.");
      annots = map((annot) => ({ ...annot, group }));
      break;
    }
    case "ungroup":
      annots = map((annot) => ({ ...annot, group: undefined }));
      break;
    case "move":
      annots = map((annot) => translateAnnot(annot, command.dx, command.dy));
      break;
    case "front":
      annots = [...annots.filter((annot) => !set.has(annot.id)), ...selected];
      break;
    case "back":
      annots = [...selected, ...annots.filter((annot) => !set.has(annot.id))];
      break;
    case "forward":
    case "backward": {
      annots = [...annots];
      const forward = command.kind === "forward";
      for (
        let index = forward ? annots.length - 2 : 1;
        forward ? index >= 0 : index < annots.length;
        index += forward ? -1 : 1
      ) {
        const other = index + (forward ? 1 : -1);
        if (
          set.has(annots[index].id) &&
          !set.has(annots[other].id) &&
          annots[index].page === annots[other].page
        )
          [annots[index], annots[other]] = [annots[other], annots[index]];
      }
      break;
    }
    case "align": {
      if (selected.length < 2 || new Set(selected.map((annot) => annot.page)).size > 1)
        throw new Error("Selecione duas ou mais anotações da mesma página para alinhar.");
      const bounds = selected.map((annot) => command.bounds[annot.id] ?? annotBounds(annot));
      const left = Math.min(...bounds.map((box) => box.x)),
        right = Math.max(...bounds.map((box) => box.x + box.w)),
        top = Math.min(...bounds.map((box) => box.y)),
        bottom = Math.max(...bounds.map((box) => box.y + box.h));
      annots = map((annot) => {
        const box: Box = command.bounds[annot.id] ?? annotBounds(annot),
          axis = command.axis;
        const dx =
          axis === "left"
            ? left - box.x
            : axis === "right"
              ? right - box.x - box.w
              : axis === "center"
                ? (left + right - box.w) / 2 - box.x
                : 0;
        const dy =
          axis === "top"
            ? top - box.y
            : axis === "bottom"
              ? bottom - box.y - box.h
              : axis === "middle"
                ? (top + bottom - box.h) / 2 - box.y
                : 0;
        return translateAnnot(annot, dx, dy);
      });
      break;
    }
  }
  const next = { ...content, annots };
  contentSchema.parse(next);
  return { content: next, selection };
}
