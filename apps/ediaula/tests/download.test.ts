import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { downloadVerified, IntegrityError, removeStaleParts } from "../src/main/download.ts";

const payload = randomBytes(512 * 1024);
const expected = {
  sha256: createHash("sha256").update(payload).digest("hex"),
  size: payload.length,
};
const ETAG = '"v1"';

const root = await mkdtemp(join(tmpdir(), "ediaula-download-"));
after(() => rm(root, { recursive: true, force: true }));

interface Seen {
  range?: string;
  ifRange?: string;
}

/** A local file server: `ranges` honours Range/If-Range; `cutAt` drops the first transfer midway. */
async function serve(opts: { ranges: boolean; cutAt?: number }): Promise<{
  url: string;
  seen: Seen[];
  close: () => Promise<void>;
}> {
  const seen: Seen[] = [];
  let first = true;
  const server: Server = createServer((req, res) => {
    const ifRange = req.headers["if-range"];
    seen.push({
      range: req.headers.range,
      ifRange: typeof ifRange === "string" ? ifRange : undefined,
    });
    const m = opts.ranges ? /^bytes=(\d+)-$/.exec(req.headers.range ?? "") : null;
    if (m && ifRange === ETAG) {
      const start = Number(m[1]);
      res.writeHead(206, {
        etag: ETAG,
        "accept-ranges": "bytes",
        "content-length": payload.length - start,
        "content-range": `bytes ${start}-${payload.length - 1}/${payload.length}`,
      });
      res.end(payload.subarray(start));
      return;
    }
    res.writeHead(200, { etag: ETAG, "content-length": payload.length });
    if (first && opts.cutAt) {
      first = false;
      res.write(payload.subarray(0, opts.cutAt), () => res.destroy());
      return;
    }
    res.end(payload);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}/model.bin`,
    seen,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

const run = (url: string, dest: string, exp = expected): Promise<void> =>
  downloadVerified(url, dest, exp, new AbortController().signal);

test("a wrong hash is refused and the .part is removed", async () => {
  const server = await serve({ ranges: true });
  const dest = join(root, "wrong.bin");
  try {
    await assert.rejects(
      run(server.url, dest, { ...expected, sha256: "0".repeat(64) }),
      IntegrityError,
    );
    assert.equal(existsSync(dest), false, "nothing renamed into place");
    assert.equal(existsSync(`${dest}.part`), false, "the .part is gone");
    assert.equal(existsSync(`${dest}.part.json`), false, "and so is its record");
  } finally {
    await server.close();
  }
});

test("a size the server announces differently is refused before anything is written", async () => {
  const server = await serve({ ranges: true });
  const dest = join(root, "size.bin");
  try {
    await assert.rejects(
      run(server.url, dest, { ...expected, size: expected.size + 1 }),
      IntegrityError,
    );
    assert.equal(existsSync(`${dest}.part`), false);
  } finally {
    await server.close();
  }
});

test("an interrupted download resumes with Range and If-Range", async () => {
  const server = await serve({ ranges: true, cutAt: 200 * 1024 });
  const dest = join(root, "resume.bin");
  try {
    await assert.rejects(run(server.url, dest));
    const kept = (await stat(`${dest}.part`)).size;
    assert.ok(kept > 0 && kept < payload.length, "the bytes received are kept");
    const info = JSON.parse(await readFile(`${dest}.part.json`, "utf8"));
    assert.deepEqual(info, { url: server.url, etag: ETAG, size: payload.length });

    const ratios: number[] = [];
    await downloadVerified(server.url, dest, expected, new AbortController().signal, (r) =>
      ratios.push(r),
    );
    assert.deepEqual(server.seen[1], { range: `bytes=${kept}-`, ifRange: ETAG });
    assert.ok(ratios[0] > 0, "progress starts from what was already on disk");
    assert.ok((await readFile(dest)).equals(payload), "the joined file is the original");
    assert.equal(existsSync(`${dest}.part`), false);
    assert.equal(existsSync(`${dest}.part.json`), false);
  } finally {
    await server.close();
  }
});

test("a server without Range support starts over from zero", async () => {
  const server = await serve({ ranges: false, cutAt: 100 * 1024 });
  const dest = join(root, "restart.bin");
  try {
    await assert.rejects(run(server.url, dest));
    assert.ok(existsSync(`${dest}.part`));
    await run(server.url, dest);
    assert.ok(server.seen[1].range, "the second attempt asked for the rest");
    assert.ok((await readFile(dest)).equals(payload), "the 200 answer replaced the partial bytes");
  } finally {
    await server.close();
  }
});

test("a .part changed on disk is caught by the final hash", async () => {
  const server = await serve({ ranges: true, cutAt: 150 * 1024 });
  const dest = join(root, "tampered.bin");
  try {
    await assert.rejects(run(server.url, dest));
    const bytes = await readFile(`${dest}.part`);
    bytes[0] ^= 0xff;
    await writeFile(`${dest}.part`, bytes);
    await assert.rejects(run(server.url, dest), IntegrityError);
    assert.equal(existsSync(dest), false);
    assert.equal(existsSync(`${dest}.part`), false);
  } finally {
    await server.close();
  }
});

test("unfinished downloads older than seven days are deleted at startup", async () => {
  const dir = await mkdtemp(join(root, "stale-"));
  const old = join(dir, "old.bin.part");
  const fresh = join(dir, "fresh.bin.part");
  await writeFile(old, "x");
  await writeFile(`${old}.json`, "{}");
  await writeFile(fresh, "y");
  const eightDaysAgo = new Date(Date.now() - 8 * 24 * 3600 * 1000);
  await utimes(old, eightDaysAgo, eightDaysAgo);
  const removed = await removeStaleParts([dir, join(dir, "missing")]);
  assert.deepEqual(removed, [old]);
  assert.equal(existsSync(old), false);
  assert.equal(existsSync(`${old}.json`), false);
  assert.ok(existsSync(fresh));
});
