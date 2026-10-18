/**
 * Cache curto em memória para agregados que custam uma varredura. Várias pessoas
 * da equipe abrindo o painel no mesmo minuto não repetem a mesma soma.
 * Guarda a promessa, então pedidos simultâneos compartilham uma consulta só.
 */
type Entry = { at: number; value: Promise<unknown> };

const store =
  (globalThis as typeof globalThis & { __bastidoresMemo?: Map<string, Entry> }).__bastidoresMemo ??
  new Map<string, Entry>();
(globalThis as typeof globalThis & { __bastidoresMemo?: Map<string, Entry> }).__bastidoresMemo =
  store;

export function memo<T>(key: string, ttlMs: number, run: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && now - hit.at < ttlMs) return hit.value as Promise<T>;
  const value = run();
  store.set(key, { at: now, value });
  // Falha não fica no cache: a próxima abertura tenta de novo.
  value.catch(() => {
    if (store.get(key)?.value === value) store.delete(key);
  });
  return value;
}
