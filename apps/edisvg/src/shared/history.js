/** Immutable project checkpoints shared by manual edits and assistant tools. */
export function createHistory(initial, limit = 100) {
  let current = structuredClone(initial);
  const past = [],
    future = [];
  const copy = (value) => structuredClone(value);
  return {
    get canUndo() {
      return past.length > 0;
    },
    get canRedo() {
      return future.length > 0;
    },
    commit(next) {
      if (JSON.stringify(current) === JSON.stringify(next)) return false;
      past.push(copy(current));
      if (past.length > limit) past.shift();
      current = copy(next);
      future.length = 0;
      return true;
    },
    undo() {
      if (!past.length) return null;
      future.push(copy(current));
      current = past.pop();
      return copy(current);
    },
    redo() {
      if (!future.length) return null;
      past.push(copy(current));
      current = future.pop();
      return copy(current);
    },
    reset(next) {
      current = copy(next);
      past.length = 0;
      future.length = 0;
    },
  };
}
