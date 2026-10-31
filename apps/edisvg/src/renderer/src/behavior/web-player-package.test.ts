import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { strFromU8, unzipSync } from "fflate";
import { parseExportPayload } from "../../../main/exportPayload";
import { buildWebPlayerPackage, type WebPlayerFiles } from "./web-player-package";

const files: WebPlayerFiles = {
  "edi-web-player.mjs": "export async function mountWebAnimation() {}",
  "edi-web-data.mjs":
    "export function normalizeWebAnimation(value) { return JSON.stringify(value); }",
  "edi-web-player.d.mts": "export declare function mountWebAnimation(): Promise<void>;",
  "edi-web-data.d.mts": "export declare function normalizeWebAnimation(value: unknown): string;",
  "edi-web-types.d.ts": "export interface WebAnimationValue {}",
  "THIRD_PARTY_LICENSES.txt": "MIT License\nCopyright fixture",
};

test("reusable player ZIP is deterministic, hash-verifiable and accepted by the native boundary", () => {
  const result = buildWebPlayerPackage(files);
  assert.deepEqual(buildWebPlayerPackage(files).content, result.content);
  const zip = unzipSync(result.content);
  function entry(name: string) {
    const value = zip[name];
    assert.ok(value, `Missing ${name}`);
    return strFromU8(value);
  }
  const manifest = JSON.parse(entry("manifest.json"));
  assert.equal(manifest.format, "edi-web-player");
  assert.equal(manifest.animationFormat, 1);
  for (const [name, value] of Object.entries(zip)) {
    if (name === "manifest.json") continue;
    assert.deepEqual(manifest.files[name], {
      bytes: value.byteLength,
      sha256: createHash("sha256").update(value).digest("hex"),
    });
  }
  assert.equal(Object.keys(manifest.files).length, 9);
  assert.match(entry("README.md"), /Não depende do Sistema Zero/);
  assert.match(entry("EdiAnimation.tsx"), /controller.abort\(\); svg.remove\(\)/);
  const saved = parseExportPayload({
    extension: result.extension,
    content: Buffer.from(result.content).toString("base64"),
    encoding: "base64",
  });
  assert.deepEqual(saved.content, Buffer.from(result.content));
});

test("player packaging refuses incomplete, unlicensed, unexpected and oversized content", () => {
  assert.throws(() => buildWebPlayerPackage({ ...files, "edi-web-data.mjs": "" }));
  assert.throws(() => buildWebPlayerPackage({ ...files, "THIRD_PARTY_LICENSES.txt": "" }));
  assert.throws(() => buildWebPlayerPackage(Object.assign({}, files, { "extra.js": "alert(1)" })));
  assert.throws(
    () =>
      buildWebPlayerPackage({
        ...files,
        "edi-web-data.mjs": `normalizeWebAnimation${"x".repeat(10_000_000)}`,
      }),
    /10 MB/,
  );
});
