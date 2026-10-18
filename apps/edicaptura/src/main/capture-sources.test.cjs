const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  listCaptureSources,
  acquireScreens,
  acquireWindow,
  windowHandle,
} = require("./capture-sources.ts");
const displays = [
  { id: "a", bounds: { x: -100, y: 0, width: 100, height: 100 }, scaleFactor: 1, rotation: 0 },
];
const image = { isEmpty: () => false, getSize: () => ({ width: 100, height: 100 }) };
const source = { id: "screen:9:0", display_id: "a", name: "fixture", thumbnail: image };
test("source lookup uses display_id and actual thumbnail dimensions only", async () => {
  const result = await acquireScreens({ getSources: async () => [source] }, displays, {
    currentTopology: () => displays,
  });
  assert.equal(result[0].sourceId, "screen:9:0");
  assert.equal(result[0].width, 100);
  await assert.rejects(
    () =>
      acquireScreens({ getSources: async () => [{ ...source, display_id: "" }] }, displays, {
        currentTopology: () => displays,
      }),
    /indisponível|topologia/,
  );
});
test("preview acquisition rejects actual oversized bitmaps and changed source sets", async () => {
  const oversized = { ...image, getSize: () => ({ width: 32768, height: 32768 }) };
  await assert.rejects(
    () =>
      listCaptureSources(
        { getSources: async () => [{ ...source, thumbnail: oversized }] },
        "screen",
        { preview: true },
      ),
    /Limite agregado/,
  );
  let calls = 0;
  await assert.rejects(
    () =>
      listCaptureSources(
        {
          getSources: async () =>
            ++calls === 1 ? [source] : [source, { ...source, id: "screen:10:0" }],
        },
        "screen",
        { preview: true },
      ),
    /alteradas/,
  );
  await assert.rejects(
    () =>
      acquireScreens(
        { getSources: async () => [source, { ...source, id: "screen:10:0", display_id: "extra" }] },
        displays,
        { currentTopology: () => displays },
      ),
    /topologia/,
  );
});
test("metadata listing skips thumbnails and validates source identities", async () => {
  let options;
  const listed = await listCaptureSources(
    {
      getSources: async (input) => {
        options = input;
        return [source];
      },
    },
    "screen",
  );
  assert.deepEqual(options.thumbnailSize, { width: 0, height: 0 });
  assert.equal(listed[0].preview, null);
  assert.equal(windowHandle("window:123:0"), "123");
  for (const id of [
    "screen:123:0",
    "window:0:0",
    "window:0:2",
    "window:123:-1",
    "window:123:9223372036854775808",
    "window:123:2:s",
    "window:1;exit:0",
  ])
    assert.throws(() => windowHandle(id));
});
test("Electron own Aura window IDs remain native handles, with every eager source budgeted", async () => {
  assert.equal(windowHandle("window:123:2"), "123");
  assert.equal(windowHandle("window:456:9223372036854775807"), "456");
  const sources = [2, 3, 4].map((suffix) => ({
    ...source,
    id: `window:${suffix + 100}:${suffix}`,
  }));
  const listed = await listCaptureSources({ getSources: async () => sources }, "window", {
    preview: true,
  });
  assert.deepEqual(
    listed.map((item) => item.id),
    sources.map((item) => item.id),
  );
  const target = {
    handle: "102",
    identity: "102:1:1",
    bounds: { x: 0, y: 0, width: 100, height: 100 },
  };
  const actual = await acquireWindow({ getSources: async () => sources }, target, {
    readTarget: async () => target,
  });
  assert.equal(actual, image);
  await assert.rejects(
    () =>
      listCaptureSources(
        {
          getSources: async () => [
            sources[0],
            { ...sources[1], thumbnail: { getSize: () => ({ width: 32768, height: 32768 }) } },
          ],
        },
        "window",
        { preview: true },
      ),
    /Limite agregado/,
  );
  let acquisitions = 0;
  await assert.rejects(
    () =>
      acquireWindow(
        {
          getSources: async () => {
            acquisitions++;
            return sources;
          },
        },
        { ...target, bounds: { x: 0, y: 0, width: 6000, height: 6000 } },
        {
          readTarget: async () => ({
            ...target,
            bounds: { x: 0, y: 0, width: 6000, height: 6000 },
          }),
        },
      ),
    /Limite agregado/,
  );
  assert.equal(acquisitions, 1, "all own Aura sources count before thumbnail acquisition");
  await assert.rejects(
    () =>
      listCaptureSources(
        { getSources: async () => [sources[0], { ...source, id: "window:0:7" }] },
        "window",
      ),
    /Identidade/,
  );
});
test("cancel and changed topology reject pending source acquisition", async () => {
  const controller = new AbortController();
  await assert.rejects(() =>
    acquireScreens(
      {
        getSources: async () => {
          controller.abort();
          return [source];
        },
      },
      displays,
      { signal: controller.signal, currentTopology: () => displays },
    ),
  );
  let current = displays;
  await assert.rejects(
    () =>
      acquireScreens(
        {
          getSources: async () => {
            current = [{ ...displays[0], rotation: 90 }];
            return [source];
          },
        },
        displays,
        { currentTopology: () => current },
      ),
    /Topologia/,
  );
});
test("window acquisition rejects movement during async capture and late cancellation", async () => {
  const target = {
    handle: "123",
    identity: "123:1:1",
    bounds: { x: 0, y: 0, width: 100, height: 100 },
  };
  let reads = 0;
  await assert.rejects(
    () =>
      acquireWindow({ getSources: async () => [{ ...source, id: "window:123:0" }] }, target, {
        readTarget: async () =>
          ++reads === 1 ? target : { ...target, bounds: { ...target.bounds, x: 1 } },
      }),
    /TARGET_CHANGED/,
  );
  const controller = new AbortController();
  await assert.rejects(() =>
    acquireWindow(
      {
        getSources: async () => {
          controller.abort();
          return [{ ...source, id: "window:123:0" }];
        },
      },
      target,
      { signal: controller.signal, readTarget: async () => target },
    ),
  );
});
