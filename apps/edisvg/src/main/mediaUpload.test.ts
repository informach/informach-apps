import assert from "node:assert/strict";
import { test } from "node:test";
import { RASTER_LIMITS, RASTER_SLICE_BYTES } from "../shared/raster/limits";
import { createMediaUploads } from "./mediaUpload";

const media = {
  gif: Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 0, 0x3b]),
  mp4: Uint8Array.from([0, 0, 0, 16, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]),
  webm: Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81]),
  "png.zip": Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]),
};

function send(
  uploads: ReturnType<typeof createMediaUploads>,
  extension: string,
  bytes: Uint8Array,
  slice = 3,
) {
  const id = uploads.begin({ extension, size: bytes.byteLength });
  for (let offset = 0; offset < bytes.byteLength; offset += slice)
    uploads.append(id, bytes.slice(offset, offset + slice));
  return id;
}

test("raster and video arrive in slices and are saved only whole and in their own format", () => {
  const uploads = createMediaUploads();
  for (const [extension, bytes] of Object.entries(media)) {
    const saved = uploads.finish(send(uploads, extension, bytes));
    assert.equal(saved.extension, extension);
    assert.deepEqual(Buffer.from(saved.content), Buffer.from(bytes));
  }
  const named = uploads.begin({ extension: "gif", size: media.gif.byteLength, name: "Cena 1" });
  uploads.append(named, media.gif);
  assert.equal(uploads.finish(named).name, "Cena 1");
  // A finished upload is gone: it cannot be saved twice.
  const once = send(uploads, "gif", media.gif);
  uploads.finish(once);
  assert.throws(() => uploads.finish(once), /inexistente/);
});

test("uploads refuse other formats, mismatched bytes, short or long transfers and client paths", () => {
  const uploads = createMediaUploads();
  for (const [extension, bytes] of [
    ["gif", media.mp4],
    ["mp4", media.webm],
    ["webm", media.gif],
    ["png.zip", media.gif],
  ] as const)
    assert.throws(() => uploads.finish(send(uploads, extension, bytes)), /não corresponde/);
  for (const header of [
    { extension: "react.zip", size: 16 },
    { extension: "exe", size: 16 },
    { extension: "gif", size: 4 },
    { extension: "gif", size: 16, path: "C:/arbitrary" },
    { extension: "gif", size: 16, name: "../fora" },
    { extension: "gif", size: RASTER_LIMITS.maxBytes.gif + 1 },
    { extension: "mp4", size: RASTER_LIMITS.maxBytes.mp4 + 1 },
  ])
    assert.throws(() => uploads.begin(header));
  const short = uploads.begin({ extension: "gif", size: media.gif.byteLength });
  uploads.append(short, media.gif.slice(0, 6));
  assert.throws(() => uploads.finish(short), /incompleta/);
  const long = uploads.begin({ extension: "gif", size: 8 });
  assert.throws(() => uploads.append(long, media.gif), /mais bytes/);
  assert.throws(() => uploads.append(long, Uint8Array.of(1)), /inexistente/);
  const array = uploads.begin({ extension: "gif", size: media.gif.byteLength });
  assert.throws(() => uploads.append(array, Array.from(media.gif)), /inválida/);
  const empty = uploads.begin({ extension: "gif", size: media.gif.byteLength });
  assert.throws(() => uploads.append(empty, new Uint8Array(0)), /inválida/);
  const huge = uploads.begin({ extension: "mp4", size: RASTER_SLICE_BYTES + 16 });
  assert.throws(() => uploads.append(huge, new Uint8Array(RASTER_SLICE_BYTES + 1)), /inválida/);
});

test("a new export or a discard drops the upload in flight", () => {
  const uploads = createMediaUploads();
  const first = uploads.begin({ extension: "gif", size: media.gif.byteLength });
  const second = send(uploads, "webm", media.webm);
  assert.throws(() => uploads.append(first, media.gif), /inexistente/);
  uploads.discard(first);
  assert.equal(uploads.finish(second).extension, "webm");
  const discarded = uploads.begin({ extension: "gif", size: media.gif.byteLength });
  uploads.discard(discarded);
  assert.throws(() => uploads.append(discarded, media.gif), /inexistente/);
});

test("a video larger than one IPC message is announced and then received in slices", () => {
  const uploads = createMediaUploads(),
    size = 5 * RASTER_SLICE_BYTES;
  assert.ok(size > 256 * 1024 ** 2);
  uploads.discard(uploads.begin({ extension: "mp4", size }));
  assert.throws(() => uploads.begin({ extension: "gif", size }), /limite/);
});
