/**
 * A file the main process makes in its cache and hands to the editor (a transcript, the voice
 * rendered as one file): the editor reads it through media:// and other channels check reads, so
 * it becomes readable before its path goes out.
 */
export function withReadGrant<A extends unknown[]>(
  work: (...args: A) => Promise<string>,
  grantRead: (path: string) => Promise<void>,
): (...args: A) => Promise<string> {
  return async (...args) => {
    const path = await work(...args);
    await grantRead(path);
    return path;
  };
}
