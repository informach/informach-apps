import { revisionSources } from "@shared/document-sources";
import { useApp } from "../state/store";
import { releaseDocumentPreview } from "./document-preview";
import { releaseDocumentText } from "./document-text";
import { releaseSource } from "./pdf";

/** Retain all undo/saved references, but release structural versions evicted from history. */
export function startSourceLifecycle(): () => void {
  return useApp.subscribe((state, previous) => {
    if (
      !state.docs.some(
        (doc) => previous.docs.find((old) => old.id === doc.id)?.content !== doc.content,
      )
    )
      return;
    for (const doc of state.docs)
      if (previous.docs.find((old) => old.id === doc.id)?.content !== doc.content) {
        releaseDocumentText(doc.id);
        releaseDocumentPreview(doc.id);
      }
    const keep = new Map(state.docs.map((doc) => [doc.id, revisionSources(doc)]));
    const all = new Set([...keep.values()].flatMap((ids) => [...ids]));
    const released = new Set<string>();
    let changed = false;
    const docs = state.docs.map((doc) => {
      const needed = keep.get(doc.id);
      const sourceIds = doc.sourceIds.filter((id) => {
        if (needed?.has(id)) return true;
        if (!all.has(id)) released.add(id);
        return false;
      });
      if (sourceIds.length === doc.sourceIds.length) return doc;
      changed = true;
      return { ...doc, sourceIds };
    });
    if (changed) useApp.setState({ docs });
    for (const id of released) releaseSource(id);
  });
}
