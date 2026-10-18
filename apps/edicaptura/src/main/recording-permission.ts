/** Capture authority must still be the same object after asynchronous source discovery. */
export async function resolveRecordingSource<T extends { id: string }>(
  authority: { sourceId: string },
  valid: () => boolean,
  sources: () => Promise<T[]>,
): Promise<T | null> {
  if (!valid()) return null;
  const selected = authority.sourceId;
  const list = await sources();
  if (!valid() || authority.sourceId !== selected) return null;
  return list.find((source) => source.id === selected) ?? null;
}
