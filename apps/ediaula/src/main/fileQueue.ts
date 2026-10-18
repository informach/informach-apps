/**
 * Read-modify-write of a small file of the app (a conversation, a course's learning), one at a
 * time per file: two writes that start together never read the same old content and lose the
 * other's change. The chain only waits for the work to end; its result or failure goes to the
 * caller.
 */
const chains = new Map<string, Promise<unknown>>();

export function oneAtATime<T>(file: string, work: () => Promise<T>): Promise<T> {
  const key = file.toLowerCase();
  const next = (chains.get(key) ?? Promise.resolve()).then(work);
  const settled = Promise.allSettled([next]);
  chains.set(key, settled);
  void settled.then(() => {
    if (chains.get(key) === settled) chains.delete(key);
  });
  return next;
}
