import type Redis from "ioredis";
import { z } from "zod";

export interface PairingBus {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttl: number): Promise<void>;
  setSeNovo(key: string, value: string, ttl: number): Promise<boolean>;
  incr(key: string, ttl: number): Promise<number>;
  publicar(channel: string, message: string): Promise<void>;
  assinar(
    channel: string,
    receive: (message: string) => void,
    lost: () => void,
  ): Promise<() => Promise<void>>;
}

type Listener = { receive: (message: string) => void; lost: () => void };
type Channel = { listeners: Set<Listener>; ready: Promise<void> };
type Subscription = { client: Redis; channels: Map<string, Channel> };

/** One multiplexed subscriber per process; a lost socket requires a freshly authorized SSE. */
export function createRedisPairingBus(publisher: Redis): PairingBus {
  let current: Subscription | null = null;
  function disconnect(subscription: Subscription) {
    if (current === subscription) current = null;
    const listeners = [...subscription.channels.values()].flatMap((channel) => [
      ...channel.listeners,
    ]);
    subscription.channels.clear();
    subscription.client.disconnect();
    for (const listener of listeners) listener.lost();
  }
  function subscriber() {
    if (current) return current;
    const client = publisher.duplicate({
      autoResubscribe: false,
      autoResendUnfulfilledCommands: false,
      retryStrategy: () => null,
    });
    const subscription: Subscription = { client, channels: new Map() };
    current = subscription;
    client.on("message", (channel: string, message: string) => {
      for (const listener of subscription.channels.get(channel)?.listeners ?? [])
        listener.receive(message);
    });
    client.on("error", () => disconnect(subscription));
    client.on("close", () => disconnect(subscription));
    return subscription;
  }
  return {
    get: (key) => publisher.get(key),
    async set(key, value, ttl) {
      await publisher.set(key, value, "EX", ttl);
    },
    async setSeNovo(key, value, ttl) {
      return (await publisher.set(key, value, "EX", ttl, "NX")) === "OK";
    },
    async incr(key, ttl) {
      return z
        .number()
        .int()
        .positive()
        .parse(
          await publisher.eval(
            "local n = redis.call('INCR', KEYS[1]); if n == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]); end; return n",
            1,
            key,
            ttl,
          ),
        );
    },
    async publicar(channel, message) {
      await publisher.publish(channel, message);
    },
    async assinar(name, receive, lost) {
      const subscription = subscriber();
      let channel = subscription.channels.get(name);
      if (!channel) {
        channel = {
          listeners: new Set(),
          ready: subscription.client.subscribe(name).then(() => undefined),
        };
        subscription.channels.set(name, channel);
      }
      const listener = { receive, lost };
      channel.listeners.add(listener);
      try {
        await channel.ready;
        if (current !== subscription)
          throw new Error("Pairing subscription closed before acknowledgement");
      } catch (error) {
        disconnect(subscription);
        throw error;
      }
      return async () => {
        channel.listeners.delete(listener);
        if (channel.listeners.size || subscription.channels.get(name) !== channel) return;
        subscription.channels.delete(name);
        if (!subscription.channels.size) {
          disconnect(subscription);
          return;
        }
        try {
          await subscription.client.unsubscribe(name);
        } catch (error) {
          disconnect(subscription);
          throw error;
        }
      };
    },
  };
}
