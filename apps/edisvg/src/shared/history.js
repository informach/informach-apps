/** Immutable project checkpoints shared by manual edits and assistant tools. */
export function createHistory(initial, limit = 100, byteBudget = 32_000_000) {
  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    !Number.isSafeInteger(byteBudget) ||
    byteBudget < 1
  )
    throw new Error("Limites de histórico inválidos.");
  const encoder = new TextEncoder();
  const blobs = new Map();
  const assetCatalog = (value) =>
    value &&
    typeof value === "object" &&
    Array.isArray(value.assets) &&
    value.assets.every(
      (asset) =>
        asset &&
        typeof asset === "object" &&
        /^asset-[0-9a-f]{64}$/.test(asset.id) &&
        typeof asset.data === "string",
    )
      ? value.assets
      : null;
  const checkpoint = (value) => {
    const assets = assetCatalog(value),
      pending = new Map();
    for (const asset of assets ?? []) {
      const known = blobs.get(asset.id) ?? pending.get(asset.id);
      if (known && known.data !== asset.data)
        throw new Error("Identidade de recurso com bytes conflitantes no histórico.");
      if (!pending.has(asset.id)) pending.set(asset.id, { data: asset.data });
    }
    const snapshot = structuredClone(
        assets
          ? { ...value, assets: assets.map(({ data: _data, ...metadata }) => metadata) }
          : value,
      ),
      encoded = JSON.stringify(snapshot);
    return {
      value: snapshot,
      encoded,
      bytes: encoder.encode(encoded).byteLength,
      blobIds: new Set(pending.keys()),
      pending,
    };
  };
  function retain(entry) {
    for (const [id, value] of entry.pending) {
      const known = blobs.get(id);
      if (known) known.references++;
      else
        blobs.set(id, {
          data: value.data,
          bytes: encoder.encode(value.data).byteLength,
          references: 1,
        });
    }
    entry.pending.clear();
    return entry;
  }
  function release(entry) {
    for (const id of entry.blobIds) {
      const value = blobs.get(id);
      if (!value) throw new Error("Recurso perdido no histórico.");
      if (--value.references === 0) blobs.delete(id);
    }
  }
  const blobBytes = () => [...blobs.values()].reduce((total, value) => total + value.bytes, 0);
  let current = retain(checkpoint(initial)),
    evicted = 0;
  const past = [],
    future = [];
  const copy = (entry) => {
    const value = structuredClone(entry.value);
    for (const asset of entry.blobIds.size ? value.assets : [])
      if (entry.blobIds.has(asset.id)) {
        const blob = blobs.get(asset.id);
        if (!blob) throw new Error("Recurso perdido no histórico.");
        asset.data = blob.data;
      }
    return value;
  };
  return {
    get canUndo() {
      return past.length > 0;
    },
    get canRedo() {
      return future.length > 0;
    },
    get evictedCount() {
      return evicted;
    },
    commit(next) {
      const entry = checkpoint(next);
      if (current.encoded === entry.encoded) return false;
      retain(entry);
      past.push(current);
      current = entry;
      for (const entry of future) release(entry);
      future.length = 0;
      let checkpointBytes = current.bytes + past.reduce((total, item) => total + item.bytes, 0);
      while (past.length && (past.length > limit || checkpointBytes + blobBytes() > byteBudget)) {
        const removed = past.shift();
        checkpointBytes -= removed.bytes;
        release(removed);
        evicted++;
      }
      return true;
    },
    undo() {
      if (!past.length) return null;
      future.push(current);
      current = past.pop();
      return copy(current);
    },
    redo() {
      if (!future.length) return null;
      past.push(current);
      current = future.pop();
      return copy(current);
    },
    reset(next) {
      const entry = retain(checkpoint(next));
      for (const previous of [current, ...past, ...future]) release(previous);
      current = entry;
      past.length = 0;
      future.length = 0;
      evicted = 0;
    },
  };
}
