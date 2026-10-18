const { test } = require("node:test");
const assert = require("node:assert/strict");
const { scrollMain } = require("../../tests/fixtures/scroll-main.cjs");
const edits = [
  { op: "remove", index: 1 },
  { op: "configure", axis: "horizontal", margins: { top: 1, bottom: 2, left: 3, right: 4 } },
  { op: "cut", index: 1, overlap: 20 },
];
for (const edit of edits)
  test(`actual main/worker ${edit.op} cancellation publishes restored idle state`, async () => {
    const h = scrollMain();
    try {
      await h.api.next(false);
      const before = JSON.parse(JSON.stringify(h.api.control()));
      const pending = h.api.review(edit);
      await Promise.resolve();
      await Promise.resolve();
      assert.equal(h.api.state().scroll.state().busy, true);
      h.api.pause();
      await assert.rejects(pending, /cancelado/);
      const state = h.api.control(),
        published = h.messages.filter((m) => m.name === "control-update").at(-1).value;
      for (const key of ["count", "cuts", "axis", "margins", "dimensions", "seams"])
        assert.deepEqual(state[key], before[key]);
      assert.equal(state.busy, false);
      assert.equal(state.paused, true);
      assert.equal(published.busy, false);
      assert.equal(published.count, 2);
      assert.equal(h.api.state().segments, h.api.state().scroll.images);
      assert.equal(h.api.state().overlaps, h.api.state().scroll.cuts);
      await h.api.review({ op: "preview" });
      await h.api.finish();
      assert.equal(h.saved.length, 1);
    } finally {
      h.api.cleanup();
    }
  });
test("review rollback cannot publish or modify a replacement capture", async () => {
  const h = scrollMain();
  try {
    await h.api.next(false);
    const pending = h.api.review(edits[0]);
    await Promise.resolve();
    await Promise.resolve();
    const old = h.api.replace(),
      count = h.messages.length;
    old.scroll.stop();
    await assert.rejects(pending, /cancelado/);
    assert.equal(h.api.control().count, 1);
    assert.equal(h.messages.length, count);
    assert.equal(old.scroll.images.length, 2);
  } finally {
    h.api.cleanup();
  }
});
test("rollback reconciles and publishes to the current controller for the same capture", async () => {
  const h = scrollMain();
  try {
    await h.api.next(false);
    const pending = h.api.review(edits[0]);
    await Promise.resolve();
    await Promise.resolve();
    h.api.pause();
    h.api.replaceController();
    await assert.rejects(pending, /cancelado/);
    const state = h.messages.filter((m) => m.name === "control-update").at(-1).value;
    assert.equal(state.count, 2);
    assert.equal(state.busy, false);
    assert.equal(state.paused, true);
  } finally {
    h.api.cleanup();
  }
});
function acquisition() {
  let width = 7680,
    height = 4320,
    count = 4,
    returned,
    calls = 0,
    encodes = 0,
    normalizations = 0;
  const displays = () =>
    Array.from({ length: count }, (_, i) => ({
      id: i + 1,
      bounds: { x: i * width, y: 0, width, height },
      size: { width, height },
      scaleFactor: 1,
      rotation: 0,
    }));
  const h = scrollMain({
    displays,
    sources: async () => {
      calls++;
      return (
        returned ??
        displays().map((d) => ({
          id: `screen:${d.id}:0`,
          display_id: String(d.id),
          thumbnail: {
            getSize: () => ({ width, height }),
            isEmpty: () => false,
            toPNG: () => {
              encodes++;
              return Buffer.from([1]);
            },
          },
        }))
      );
    },
    normalize: () => {
      normalizations++;
      return { getSize: () => ({ width, height }), crop: () => h.image(40) };
    },
  });
  return {
    h,
    counts: () => ({ calls, encodes, normalizations }),
    small: (number = 1) => {
      width = 60;
      height = 100;
      count = number;
      h.api.state().display = displays()[0];
    },
    returns: (sources) => {
      returned = sources;
    },
  };
}
test("all-screen preflight rejects initial and continuing acquisition without encode, retains work and permits retry", async () => {
  const a = acquisition(),
    h = a.h;
  try {
    await assert.rejects(h.api.acquire(), /Limite|Orçamento/);
    await assert.rejects(h.api.next(false), /Limite|Orçamento/);
    assert.deepEqual(a.counts(), { calls: 0, encodes: 0, normalizations: 0 });
    assert.equal(h.api.state().segments.length, 1);
    assert.equal(h.saved.length, 0);
    a.small();
    await h.api.next(false);
    assert.equal(h.api.state().segments.length, 2);
    assert.deepEqual(a.counts(), { calls: 1, encodes: 1, normalizations: 1 });
  } finally {
    h.api.cleanup();
  }
});
test("every returned screen identity and dimensions are checked before normalization", async () => {
  for (const variant of ["oversized", "foreign", "duplicate", "malformed", "empty"]) {
    const a = acquisition(),
      h = a.h;
    try {
      a.small();
      const source = {
        id: "screen:1:0",
        display_id: "1",
        thumbnail: {
          getSize: () =>
            variant === "oversized" ? { width: 16000, height: 16000 } : { width: 60, height: 100 },
          isEmpty: () => variant === "empty",
          toPNG: () => {
            throw Error("encode reached");
          },
        },
      };
      if (variant === "foreign") source.display_id = "9";
      if (variant === "malformed") source.id = "window:1:0";
      a.returns(variant === "duplicate" ? [source, source] : [source]);
      await assert.rejects(h.api.next(false), (error) => !/encode reached/.test(error.message));
      assert.equal(a.counts().normalizations, 0);
      assert.equal(h.api.state().segments.length, 1);
    } finally {
      h.api.cleanup();
    }
  }
});
test("actual aggregate including normalization exceeds budget although thumbnails alone fit", async () => {
  const a = acquisition(),
    h = a.h;
  try {
    a.small(4);
    a.returns(
      Array.from({ length: 4 }, (_, i) => ({
        id: `screen:${i + 1}:0`,
        display_id: String(i + 1),
        thumbnail: {
          getSize: () => ({ width: 4096, height: 4096 }),
          isEmpty: () => false,
          toPNG() {
            throw Error("encode reached");
          },
        },
      })),
    );
    await assert.rejects(h.api.next(false), /512 MiB/);
    assert.deepEqual(a.counts(), { calls: 1, encodes: 0, normalizations: 0 });
    assert.equal(h.api.state().segments.length, 1);
  } finally {
    h.api.cleanup();
  }
});
test("unselected invalid dimensions and duplicate source identities reject before any encoding", async () => {
  for (const duplicate of [false, true]) {
    const a = acquisition(),
      h = a.h;
    try {
      a.small(2);
      a.returns(
        [1, 2].map((id) => ({
          id: `screen:${duplicate ? 1 : id}:0`,
          display_id: String(id),
          thumbnail: {
            getSize: () => ({ width: !duplicate && id === 2 ? NaN : 60, height: 100 }),
            isEmpty: () => false,
            toPNG() {
              throw Error("encode reached");
            },
          },
        })),
      );
      await assert.rejects(h.api.next(false), (error) => !/encode reached/.test(error.message));
      assert.equal(a.counts().normalizations, 0);
      assert.equal(h.api.state().segments.length, 1);
    } finally {
      h.api.cleanup();
    }
  }
});
test("initial scroll crop admission preserves selection before creating an oversized crop", async () => {
  const h = scrollMain();
  try {
    await assert.rejects(h.api.initialCrop({ width: 8000, height: 8000 }), /512 MiB/);
    assert.equal(h.api.state().mode, "select");
  } finally {
    h.api.cleanup();
  }
});
test("exact PNG length is admitted before normalization and late cancelled acquisition never encodes", async () => {
  const display = {
    id: 1,
    bounds: { x: 0, y: 0, width: 60, height: 100 },
    size: { width: 60, height: 100 },
    scaleFactor: 1,
    rotation: 0,
  };
  let encode = 0,
    normalize = 0,
    release;
  const source = {
    id: "screen:1:0",
    display_id: "1",
    thumbnail: {
      getSize: () => display.size,
      isEmpty: () => false,
      toPNG: () => {
        encode++;
        return { length: 512 * 1048576 };
      },
    },
  };
  const h = scrollMain({
    displays: () => [display],
    sources: () => Promise.resolve([source]),
    normalize: () => {
      normalize++;
      throw Error("normalization reached");
    },
  });
  try {
    await assert.rejects(h.api.next(false), /512 MiB/);
    assert.equal(encode, 1);
    assert.equal(normalize, 0);
    assert.equal(h.api.state().segments.length, 1);
  } finally {
    h.api.cleanup();
  }
  const late = scrollMain({
    displays: () => [display],
    sources: () =>
      new Promise((resolve) => {
        release = () => resolve([source]);
      }),
    normalize: () => {
      normalize++;
    },
  });
  try {
    const pending = late.api.next(false);
    late.api.pause();
    release();
    await assert.rejects(pending, /cancelada/);
    assert.equal(encode, 1);
    assert.equal(normalize, 0);
    assert.equal(late.api.state().segments.length, 1);
  } finally {
    late.api.cleanup();
  }
});
