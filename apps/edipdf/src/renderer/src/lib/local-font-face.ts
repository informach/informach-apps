import { inspectFontInWorker } from "./font-inspection";

interface HeldFont {
  family: string;
  users: number;
  font?: FontFace;
  loading: Promise<FontFace>;
  controller: AbortController;
}
const held = new Map<string, HeldFont>();
const fingerprints = new WeakMap<Uint8Array, Promise<{ key: string; buffer: ArrayBuffer }>>();
/** One validated font/FontFace per digest, removed after the last mounted consumer releases it. */
export async function acquireLocalFont(
  bytes: Uint8Array,
  signal: AbortSignal,
): Promise<{ family: string; release(): void }> {
  signal.throwIfAborted();
  // Source font programs are immutable/shared. Many controls must not clone/hash the same program concurrently.
  let fingerprint = fingerprints.get(bytes);
  if (!fingerprint) {
    const buffer = new Uint8Array(bytes).buffer;
    fingerprint = crypto.subtle
      .digest("SHA-256", buffer)
      .then((hash) => ({
        buffer,
        key: Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join(
          "",
        ),
      }));
    fingerprints.set(bytes, fingerprint);
  }
  const { buffer, key } = await fingerprint;
  signal.throwIfAborted();
  let entry = held.get(key);
  if (!entry) {
    const family = `EdiLocalFont-${key}`,
      controller = new AbortController();
    const loading = inspectFontInWorker(new Uint8Array(buffer), controller.signal).then(() =>
      new FontFace(family, buffer).load(),
    );
    const created: HeldFont = { family, users: 0, loading, controller };
    created.loading = created.loading.then(
      (font) => {
        created.font = font;
        if (created.users > 0 && !controller.signal.aborted) document.fonts.add(font);
        return font;
      },
      (failure: unknown) => {
        if (held.get(key) === created) held.delete(key);
        throw failure;
      },
    );
    entry = created;
    held.set(key, entry);
  }
  const owner = entry;
  owner.users++;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    signal.removeEventListener("abort", release);
    owner.users--;
    if (owner.users === 0) {
      owner.controller.abort();
      if (held.get(key) === owner) held.delete(key);
      if (owner.font) document.fonts.delete(owner.font);
    }
  };
  signal.addEventListener("abort", release, { once: true });
  try {
    await owner.loading;
    signal.throwIfAborted();
    return { family: owner.family, release };
  } catch (failure) {
    release();
    throw failure;
  }
}
