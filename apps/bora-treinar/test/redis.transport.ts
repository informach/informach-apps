import { randomUUID } from "node:crypto";
import Redis from "ioredis";
import { afterAll, describe, expect, it } from "vitest";
import { createRedisPairingBus } from "@/features/pareamento/redis-bus";

const url = process.env.REDIS_URL;
if (process.env.COMPASSO_ISOLATED_REDIS !== "1" || !url || new URL(url).hostname !== "127.0.0.1")
  throw new Error("Run with the disposable authenticated Redis fixture");
const publisher = new Redis(url, { commandTimeout: 5000, maxRetriesPerRequest: 1 });
const observer = new Redis(url, { commandTimeout: 5000, maxRetriesPerRequest: 1 });
const bus = createRedisPairingBus(publisher);
const channelName = () => `compasso-transport:${randomUUID()}`;
afterAll(async () => {
  await publisher.quit();
  await observer.quit();
});

describe("Real Redis pairing transport", () => {
  it("atomically claims one token and gives concurrent rate counters a finite TTL", async () => {
    const claim = channelName();
    expect(
      (await Promise.all(Array.from({ length: 40 }, () => bus.setSeNovo(claim, "1", 60)))).filter(
        Boolean,
      ),
    ).toHaveLength(1);
    const counter = channelName();
    const counts = await Promise.all(Array.from({ length: 100 }, () => bus.incr(counter, 60)));
    expect(new Set(counts).size).toBe(100);
    expect(Math.max(...counts)).toBe(100);
    expect(await observer.ttl(counter)).toBeGreaterThan(0);
    expect(await observer.ttl(counter)).toBeLessThanOrEqual(60);
  });

  it("acknowledges subscriptions before immediate publication, multiplexes listeners and releases the socket", async () => {
    const first = channelName();
    const second = channelName();
    const received: string[] = [];
    const dispose = await Promise.all(
      Array.from({ length: 32 }, (_, index) =>
        bus.assinar(
          index % 2 ? first : second,
          (message) => received.push(message),
          () => {},
        ),
      ),
    );
    try {
      expect(await observer.pubsub("NUMSUB", first, second)).toEqual([first, 1, second, 1]);
      await bus.publicar(first, "first");
      await bus.publicar(second, "second");
      await expect.poll(() => received.length).toBe(32);
      expect(received.filter((message) => message === "first")).toHaveLength(16);
      await Promise.all(dispose.filter((_, index) => index % 2).map((stop) => stop()));
      expect(await observer.pubsub("NUMSUB", first, second)).toEqual([first, 0, second, 1]);
      await bus.publicar(second, "still connected");
      await expect
        .poll(() => received.filter((message) => message === "still connected").length)
        .toBe(16);
    } finally {
      await Promise.all(dispose.map((stop) => stop()));
    }
    await expect
      .poll(() => observer.pubsub("NUMSUB", first, second))
      .toEqual([first, 0, second, 0]);
  });

  it("closes listeners on connection loss and creates a new acknowledged subscription on return", async () => {
    const name = channelName();
    let lost = 0;
    const stop = await bus.assinar(
      name,
      () => {},
      () => {
        lost++;
      },
    );
    try {
      const clients = String(await observer.call("CLIENT", "LIST", "TYPE", "pubsub"));
      const ids = clients
        .trim()
        .split("\n")
        .map((line) => /^id=(\d+)\s/.exec(line)?.[1])
        .filter(Boolean);
      expect(ids).toHaveLength(1); // Only the owned fixture's one subscriber, never a shared server.
      const id = ids[0];
      if (!id) throw new Error("Missing subscriber id");
      await observer.client("KILL", "ID", id);
      await expect.poll(() => lost).toBe(1);
      let received = "";
      const resumed = await bus.assinar(
        name,
        (message) => {
          received = message;
        },
        () => {},
      );
      try {
        await bus.publicar(name, "resumed");
        await expect.poll(() => received).toBe("resumed");
      } finally {
        await resumed();
      }
    } finally {
      await stop();
    }
  });
});
