import { vi } from "vitest";

type Mode = "select" | "insert" | "update";

export type FakeDbCall = {
  mode: Mode;
  args: unknown[];
};

export type FakeDbConfig = {
  /** Rows returned by `select().from().where().limit()`. */
  selectResult?: unknown[];
  /** Rows returned by `insert().values().onConflictDoNothing().returning()`. */
  insertResult?: unknown[];
  /** Rows returned by `update().set().where().returning()`. */
  updateResult?: unknown[];
  /**
   * Optional sequencer for tests that need different return values across
   * multiple calls of the same operation. Pop one entry per call. Falls back
   * to the static result above if the queue is empty.
   */
  selectQueue?: unknown[][];
  insertQueue?: unknown[][];
  updateQueue?: unknown[][];
};

/**
 * Builds a fake `db` that satisfies the Drizzle chain pattern used in this
 * package: `db.insert/select/update().<mods>().returning()|.limit()|await`.
 *
 * Only entry-point operations (`db.insert/select/update(...)`) are logged
 * in `calls`; chain modifiers (`values`, `where`, etc.) are no-ops that
 * return the same chain so the await/returning terminator wins.
 */
export function createFakeDb(config: FakeDbConfig = {}) {
  const calls: FakeDbCall[] = [];

  const dequeue = (queue?: unknown[][], fallback?: unknown[]) => {
    if (queue && queue.length > 0) {
      return queue.shift() ?? [];
    }
    return fallback ?? [];
  };

  const buildChain = (terminate: () => Promise<unknown[]>) => {
    const chain: Record<string, unknown> = {};
    const noop = (name: string) => {
      chain[name] = vi.fn(() => chain);
    };
    noop("values");
    noop("onConflictDoNothing");
    noop("from");
    noop("where");
    noop("set");

    chain.returning = vi.fn(() => terminate());
    chain.limit = vi.fn(() => terminate());
    // biome-ignore lint/suspicious/noThenProperty: required to make Drizzle chain await-able without `.returning()`
    chain.then = (
      onFulfilled?: (value: unknown[]) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => terminate().then(onFulfilled, onRejected);
    return chain;
  };

  const db = {
    select: vi.fn((...args: unknown[]) => {
      calls.push({ mode: "select", args });
      return buildChain(() => Promise.resolve(dequeue(config.selectQueue, config.selectResult)));
    }),
    insert: vi.fn((...args: unknown[]) => {
      calls.push({ mode: "insert", args });
      return buildChain(() => Promise.resolve(dequeue(config.insertQueue, config.insertResult)));
    }),
    update: vi.fn((...args: unknown[]) => {
      calls.push({ mode: "update", args });
      return buildChain(() => Promise.resolve(dequeue(config.updateQueue, config.updateResult)));
    }),
  };

  return { db, calls };
}
