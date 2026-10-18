import type { DocContent } from "./model.ts";

export function contentSources(content: DocContent): Set<string> {
  const ids = new Set(
    content.pages.filter((page) => !page.blank && page.src).map((page) => page.src),
  );
  if (content.baseSource) ids.add(content.baseSource);
  return ids;
}
export function revisionSources(document: {
  primary: string | null;
  content: DocContent;
  saved: DocContent;
  past: DocContent[];
  future: DocContent[];
}): Set<string> {
  const ids = new Set<string>();
  if (document.primary) ids.add(document.primary);
  for (const content of [document.content, document.saved, ...document.past, ...document.future])
    for (const id of contentSources(content)) ids.add(id);
  return ids;
}
