import { vi } from "vitest";

type Mode =
  | "select"
  | "insert"
  | "update"
  | "delete"
  | "execute"
  | "transaction"
  | "values"
  | "set"
  | "where"
  | "returning"
  | "limit";

export type FakeDbCall = {
  mode: Mode;
  args: unknown[];
};

export type FakeDbConfig = {
  selectResult?: unknown[];
  insertResult?: unknown[];
  updateResult?: unknown[];
  deleteResult?: unknown[];
  executeResult?: unknown;
  selectQueue?: unknown[][];
  insertQueue?: unknown[][];
  updateQueue?: unknown[][];
};

/**
 * Mocks the Drizzle chain pattern used in this package:
 *   db.{select,insert,update,delete}(...).<mods>().{returning|limit}()
 *   db.execute(sql)
 *   db.transaction(async (tx) => ...)
 */
export function createFakeDb(config: FakeDbConfig = {}) {
  const calls: FakeDbCall[] = [];

  const dequeue = (queue?: unknown[][], fallback?: unknown[]) => {
    if (queue && queue.length > 0) return queue.shift() ?? [];
    return fallback ?? [];
  };

  const buildChain = (terminate: () => Promise<unknown[]>) => {
    const chain: Record<string, unknown> = {};
    const noop = (name: string) => {
      chain[name] = vi.fn((...args: unknown[]) => {
        calls.push({ mode: name as Mode, args });
        return chain;
      });
    };
    noop("values");
    noop("onConflictDoNothing");
    noop("onConflictDoUpdate");
    noop("from");
    noop("where");
    noop("set");
    noop("orderBy");
    noop("groupBy");
    noop("having");
    noop("innerJoin");
    noop("leftJoin");
    noop("rightJoin");
    noop("fullJoin");
    noop("offset");
    noop("for");

    chain.returning = vi.fn((...args: unknown[]) => {
      calls.push({ mode: "returning", args });
      return terminate();
    });
    chain.limit = vi.fn((...args: unknown[]) => {
      calls.push({ mode: "limit", args });
      return terminate();
    });
    // biome-ignore lint/suspicious/noThenProperty: required to make Drizzle chain await-able
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
    delete: vi.fn((...args: unknown[]) => {
      calls.push({ mode: "delete", args });
      return buildChain(() => Promise.resolve(config.deleteResult ?? []));
    }),
    execute: vi.fn((...args: unknown[]) => {
      calls.push({ mode: "execute", args });
      const value = config.executeResult ?? [];
      return Promise.resolve(value);
    }),
    transaction: vi.fn(async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      calls.push({ mode: "transaction", args: [] });
      return fn(db);
    }),
  };

  return { db, calls };
}
