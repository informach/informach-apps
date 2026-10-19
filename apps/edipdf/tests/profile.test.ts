import assert from "node:assert/strict";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { createSignatureStore } from "../src/main/signature-store.ts";
import { createValidatedStore } from "../src/main/validated-store.ts";
import {
  DEFAULT_PREFERENCES,
  preferencesSchema,
  recentFilesSchema,
  signaturesSchema,
} from "../src/shared/preferences.ts";

test("corrupt local lists remain intact until explicit repair preserves a backup", async () => {
  const root = await mkdtemp(join(tmpdir(), "edipdf-profile-"));
  assert.equal(dirname(root), resolve(tmpdir()));
  assert.match(basename(root), /^edipdf-profile-[a-zA-Z0-9]+$/);
  try {
    const store = createValidatedStore(root, "recent.json", recentFilesSchema, []);
    assert.deepEqual(await store.read(), []);
    await writeFile(join(root, "recent.json"), "{invalid");
    await assert.rejects(store.read(), /preservado/);
    await assert.rejects(
      store.update((entries) => [...entries, { path: "x", name: "x", openedAt: 1 }]),
      /preservado/,
    );
    assert.equal(await readFile(join(root, "recent.json"), "utf8"), "{invalid");
    const reset = await store.reset();
    assert.ok(reset.backup);
    assert.equal(await readFile(reset.backup, "utf8"), "{invalid");
    assert.deepEqual(await store.read(), []);
    assert.equal((await readdir(root)).filter((file) => file.endsWith(".backup")).length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("local schemas reject shortcut conflicts, malformed signature images", () => {
  assert.throws(() =>
    preferencesSchema.parse({
      ...DEFAULT_PREFERENCES,
      toolShortcuts: { ...DEFAULT_PREFERENCES.toolShortcuts, text: "v" },
    }),
  );
  assert.throws(() =>
    signaturesSchema.parse([{ id: "x", src: "data:text/html,<script>", width: 1, height: 1 }]),
  );
});

test("signature migration verifies protected bytes before removing the legacy cleartext file", async () => {
  const root = await mkdtemp(join(tmpdir(), "edipdf-profile-"));
  assert.equal(dirname(root), resolve(tmpdir()));
  assert.match(basename(root), /^edipdf-profile-[a-zA-Z0-9]+$/);
  const key = randomBytes(32);
  const codec = {
    encode(value: string): Uint8Array {
      const nonce = randomBytes(12),
        cipher = createCipheriv("aes-256-gcm", key, nonce);
      const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
      return Buffer.concat([nonce, cipher.getAuthTag(), encrypted]);
    },
    decode(value: Uint8Array): string {
      const data = Buffer.from(value),
        decipher = createDecipheriv("aes-256-gcm", key, data.subarray(0, 12));
      decipher.setAuthTag(data.subarray(12, 28));
      return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString("utf8");
    },
  };
  try {
    const signatures = [
      { id: "signature", src: "data:image/png;base64,AA==", width: 20, height: 10 },
    ];
    await writeFile(join(root, "signatures.json"), JSON.stringify(signatures));
    const store = createSignatureStore(root, codec);
    assert.deepEqual(await store.read(), signatures);
    assert.ok(
      !(await readFile(join(root, "signatures.bin"))).includes(Buffer.from("data:image/png")),
    );
    assert.ok(!(await readdir(root)).includes("signatures.json"));
    await writeFile(join(root, "signatures.bin"), "invalid");
    await assert.rejects(store.read(), /preservado/);
    assert.deepEqual((await store.reset()).value, []);
    assert.deepEqual(await store.read(), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
