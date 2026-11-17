import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createRedisFixture } from "./redis-fixture.mjs";

test("Redis authenticates and cleans up with a private directory and restrictive umask", async () => {
  const previous = process.umask(0o077);
  const directory = await mkdtemp(join(tmpdir(), "compasso-redis-fixture-"));
  let fixture;
  try {
    fixture = await createRedisFixture(directory);
    assert.equal(new URL(fixture.url).hostname, "127.0.0.1");
    assert.equal((await stat(directory)).mode & 0o777, 0o700);
    assert.equal((await stat(join(directory, "redis.conf"))).mode & 0o777, 0o644);
    await fixture.dispose();
    await fixture.dispose();
  } finally {
    process.umask(previous);
    await fixture?.dispose();
    await rm(directory, { recursive: true });
  }
});
