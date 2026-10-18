import assert from "node:assert/strict";
import { test } from "node:test";
import { collectImageAssets, imageReferences, RasterAssets } from "./assets.ts";
import { imageEditSchema } from "./document.ts";

test("save budget counts a large raster once across placed copies", () => {
  const dataUrl = `data:image/png;base64,${"A".repeat(25_000_000)}`;
  const assetId = crypto.randomUUID();
  const { annotations } = imageEditSchema.parse({
    annotations: Array.from({ length: 3 }, () => ({
      kind: "image",
      assetId,
      dataUrl,
      x: 0,
      y: 0,
      x2: 10,
      y2: 10,
    })),
  });
  assert.equal(collectImageAssets(annotations).size, 1);
  assert.throws(
    () =>
      collectImageAssets(
        annotations.map((annotation) => ({ ...annotation, assetId: crypto.randomUUID() })),
      ),
    /limite/,
  );
  const conflicting = imageEditSchema.parse({
    annotations: [{ ...annotations[0], dataUrl: "data:image/png;base64,AAAA" }],
  });
  assert.throws(
    () => collectImageAssets([...annotations, ...conflicting.annotations]),
    /conflitante/,
  );
});

test("normalized assets validate unique IDs, references and legacy conflicts at the boundary", () => {
  const assetId = crypto.randomUUID(),
    dataUrl = "data:image/png;base64,AAAA";
  const { annotations } = imageEditSchema.parse({
    annotations: [{ kind: "image", assetId, x: 0, y: 0, x2: 1, y2: 1, dataUrl }],
  });
  const assets = [{ id: assetId, dataUrl }];
  assert.equal(collectImageAssets(annotations, assets).size, 1);
  assert.equal(collectImageAssets(imageReferences(annotations), assets).get(assetId), dataUrl);
  assert.throws(
    () =>
      collectImageAssets(annotations, [{ ...assets[0], dataUrl: "data:image/png;base64,BBBB" }]),
    /conflitante/,
  );
  assert.throws(() => collectImageAssets(annotations, [{ id: "../../bad", dataUrl }]));
  assert.throws(() => collectImageAssets([], assets), /referência/);
  assert.throws(() => collectImageAssets(annotations, [{ ...assets[0], path: "arbitrary" }]));
});

test("large source remains outside snapshots; only successful acknowledgment suppresses resend", () => {
  const dataUrl = `data:image/png;base64,${"A".repeat(34_000_000)}`,
    assetId = crypto.randomUUID();
  const { annotations } = imageEditSchema.parse({
    annotations: Array.from({ length: 4 }, () => ({
      kind: "image",
      assetId,
      x: 0,
      y: 0,
      x2: 1,
      y2: 1,
    })),
  });
  const store = new RasterAssets();
  store.add(assetId, dataUrl);
  assert.equal(JSON.stringify(annotations).includes("base64"), false);
  assert.equal(store.pending(annotations).length, 1);
  assert.equal(
    store.pending(annotations)[0]?.dataUrl,
    dataUrl,
    "failed operation has not acknowledged its source",
  );
  store.acknowledge(store.pending(annotations));
  assert.deepEqual(store.pending(annotations), []);
  assert.equal(store.find(dataUrl), assetId);
  assert.throws(() => store.add(assetId, "data:image/png;base64,AAAA"), /conflitante/);
  assert.throws(
    () => store.acknowledge([{ id: assetId, dataUrl: "data:image/png;base64,AAAA" }]),
    /conflitante/,
  );
  store.add(crypto.randomUUID(), dataUrl);
  assert.throws(() => store.add(crypto.randomUUID(), dataUrl), /limite/);
  const fresh = new RasterAssets();
  fresh.add(assetId, dataUrl);
  assert.equal(
    fresh.pending(annotations).length,
    1,
    "another document cannot inherit acknowledgments",
  );
});
