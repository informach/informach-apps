import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { createVersionStore } from "../src/main/version-store.ts";
import type { RecoveryDocument } from "../src/shared/document-format.ts";
import { DEFAULT_PREFERENCES } from "../src/shared/preferences.ts";
import { sessionSchema } from "../src/shared/session-format.ts";

const snapshot = (text: string): RecoveryDocument => ({
  version: 1,
  id: "doc",
  name: "original.pdf",
  updatedAt: 1,
  primary: "a",
  originPaths: ["C:\\documentos\\original.pdf"],
  sources: [{ id: "a", name: "original.pdf", data: "YWJj" }],
  content: {
    pages: [{ id: "p", src: "a", index: 0, rotation: 0 }],
    annots: [{ id: "note", page: "p", kind: "note", x: 10, y: 10, text, color: "#FFFFFF" }],
    forms: {},
    meta: {},
    watermark: null,
    pageNumbers: null,
  },
});
test("versions obey interval, deduplicate unchanged content, retain newest count and preserve origins", async () => {
  const root = await mkdtemp(join(tmpdir(), "edipdf-versions-"));
  assert.equal(dirname(root), resolve(tmpdir()));
  assert.match(basename(root), /^edipdf-versions-[a-zA-Z0-9]+$/);
  try {
    let now = Date.now();
    const store = createVersionStore(
      root,
      {
        encode: (value) => new TextEncoder().encode(value),
        decode: (value) => new TextDecoder().decode(value),
      },
      () => now,
    );
    const preferences = { ...DEFAULT_PREFERENCES, versions: 2, versionIntervalMinutes: 1 };
    await store.save(snapshot("first"), preferences);
    await store.save(snapshot("first"), preferences, true);
    await store.save(snapshot("second"), preferences);
    assert.equal((await store.list()).entries.length, 1);
    now += 61000;
    await store.save(snapshot("second"), preferences);
    await store.save(snapshot("third"), preferences, true);
    const list = await store.list();
    assert.equal(list.entries.length, 2);
    const newest = await store.load(list.entries[0].id);
    assert.equal(
      newest.content.annots[0].kind === "note" && newest.content.annots[0].text,
      "third",
    );
    assert.deepEqual(newest.originPaths, ["C:\\documentos\\original.pdf"]);
    await writeFile(join(root, "corrupt.bin"), "BROKEN");
    now += 31 * 86400000;
    await store.prune(preferences);
    const expired = await store.list();
    assert.equal(expired.entries.length, 0);
    assert.equal(expired.unreadable, 1);
    assert.equal(await readFile(join(root, "corrupt.bin"), "utf8"), "BROKEN");
    await assert.rejects(store.load("../original"));
    await store.clear();
    assert.equal((await store.list()).unreadable, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("restorable session validates bounded positions without persisting document passwords", () => {
  const session = {
    version: 1,
    activePath: "C:\\a.pdf",
    tabs: [
      {
        path: "C:\\a.pdf",
        page: 2,
        zoom: 0.75,
        fit: "width",
        reading: true,
        layout: "spread",
        offset: 30,
        left: 0,
      },
    ],
  };
  assert.deepEqual(sessionSchema.parse(session), session);
  assert.equal(
    sessionSchema.safeParse({ ...session, tabs: [{ ...session.tabs[0], zoom: Infinity }] }).success,
    false,
  );
  assert.equal(sessionSchema.safeParse({ ...session, password: "secret" }).success, false);
});
