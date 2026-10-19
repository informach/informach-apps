interface SelectionState {
  selected: string | null;
  selectedIds?: string[];
}
/** Selection is workspace state; never consumes document history. */
export function selectionIds(state: SelectionState): string[] {
  return state.selectedIds?.includes(state.selected ?? "")
    ? state.selectedIds
    : state.selected
      ? [state.selected]
      : [];
}
export function chooseObject(state: SelectionState, id: string | null, additive = false) {
  const previous = selectionIds(state);
  const ids =
    id === null
      ? []
      : additive
        ? previous.includes(id)
          ? previous.filter((value) => value !== id)
          : [...previous, id]
        : [id];
  state.selectedIds = ids;
  state.selected = ids.at(-1) ?? null;
}
