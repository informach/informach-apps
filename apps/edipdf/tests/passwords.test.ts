import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { test } from "node:test";
import { PDFDocument } from "pdf-lib";
import { PdfEngineError, securitySchema } from "../src/shared/engine-contracts.ts";
import { LocalPdfEngine } from "../src/shared/local-engine.ts";

const require = createRequire(import.meta.url);
const engine = await LocalPdfEngine.create(
  await readFile(require.resolve("@embedpdf/pdfium/pdfium.wasm")),
);
const permissions = { print: true, copy: false, modify: false, fill: false };
const emptyUser = new Uint8Array(
  await readFile(new URL("fixtures/passwords/empty-user.pdf", import.meta.url)),
);

async function fixture() {
  const pdf = await PDFDocument.create();
  pdf.addPage([200, 100]).drawText("PASSWORD_ROUNDTRIP", { x: 10, y: 50, size: 10 });
  return pdf.save();
}
async function independentText(bytes: Uint8Array, password: string) {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({
    data: new Uint8Array(bytes),
    password,
    standardFontDataUrl: `${resolve("node_modules/pdfjs-dist/standard_fonts")}/`,
  });
  try {
    const pdf = await task.promise;
    const text = await (await pdf.getPage(1)).getTextContent();
    return text.items.map((item) => ("str" in item ? item.str : "")).join(" ");
  } finally {
    await task.destroy();
  }
}

test("password creation refuses native C-string truncation and malformed Unicode", async () => {
  const bytes = await fixture();
  const original = bytes.slice();
  for (const user of ["\0reader", "abc\0one", "\ud800", "\udfff"]) {
    assert.throws(() => engine.encrypt(bytes, { user, owner: "administrator", ...permissions }));
  }
  assert.throws(() => engine.encrypt(bytes, { user: "abc", owner: "abc\0two", ...permissions }));
  assert.deepEqual(bytes, original);
  for (const password of ["fixture-admin\0suffix", "\ud800"]) {
    assert.throws(
      () => engine.decrypt(emptyUser, password),
      (error) => error instanceof PdfEngineError && error.code === "password",
    );
  }
});

test("opening and owner passwords cannot alias through PDFium's Latin-1 compatibility path", async () => {
  const bytes = await fixture();
  for (const [user, owner] of [
    ["same", "same"],
    ["é", "Ã©"],
    ["α", "Î±"],
  ]) {
    assert.equal(securitySchema.safeParse({ user, owner, ...permissions }).success, false);
    assert.throws(() => engine.encrypt(bytes, { user, owner, ...permissions }));
  }
  // Canonically equivalent strings remain distinct passwords: do not normalize user input.
  const encrypted = engine.encrypt(bytes, { user: "é", owner: "e\u0301", ...permissions });
  assert.equal(engine.inspect(encrypted, "é").ownerUnlocked, false);
  assert.equal(engine.inspect(encrypted, "e\u0301").ownerUnlocked, true);
  assert.match(await independentText(encrypted, "é"), /PASSWORD_ROUNDTRIP/);
  assert.match(await independentText(encrypted, "e\u0301"), /PASSWORD_ROUNDTRIP/);
});

test("AES-256 passwords at the 127 UTF-8 byte boundary open in both independent readers", async () => {
  const bytes = await fixture();
  const boundary = `${"α".repeat(63)}x`;
  assert.equal(new TextEncoder().encode(boundary).length, 127);
  for (const security of [
    { user: boundary, owner: "administrator", ...permissions },
    { user: "reader", owner: boundary, ...permissions },
  ]) {
    const encrypted = engine.encrypt(bytes, security);
    assert.equal(engine.inspect(encrypted, security.user).ownerUnlocked, false);
    assert.equal(engine.inspect(encrypted, security.owner).ownerUnlocked, true);
    assert.match(await independentText(encrypted, security.user), /PASSWORD_ROUNDTRIP/);
    assert.match(await independentText(encrypted, security.owner), /PASSWORD_ROUNDTRIP/);
    await assert.rejects(independentText(encrypted, "wrong-password"));
    assert.equal(engine.inspect(engine.decrypt(encrypted, security.owner)).encrypted, false);
  }
  const over = "α".repeat(64);
  for (const security of [
    { user: over, owner: "administrator", ...permissions },
    { user: "reader", owner: over, ...permissions },
  ])
    assert.throws(() => engine.encrypt(bytes, security), /127 bytes UTF-8/);
});

test("PDFs with an empty opening password still require owner authorization before mutations", async () => {
  const original = emptyUser.slice();
  assert.equal(engine.inspect(emptyUser).encrypted, true);
  assert.equal(engine.inspect(emptyUser).ownerUnlocked, false);
  for (const mutate of [
    () => engine.transform(emptyUser, [{ kind: "delete", page: 0, object: 0 }]),
    () => engine.encrypt(emptyUser, { user: "reader", owner: "administrator", ...permissions }),
    () => engine.decrypt(emptyUser, ""),
  ])
    assert.throws(
      mutate,
      (error) => error instanceof PdfEngineError && error.code === "permission",
    );
  const decrypted = engine.decrypt(emptyUser, "fixture-admin");
  assert.equal(engine.inspect(decrypted).encrypted, false);
  assert.match(await independentText(decrypted, ""), /EMPTY_OPENING_FIXTURE/);
  assert.deepEqual(emptyUser, original);
});
