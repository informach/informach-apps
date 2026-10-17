import assert from "node:assert/strict";
import { test } from "node:test";
import type { Annotation } from "../src/shared/annotation.ts";
import {
  type CopiedProps,
  groupIsSet,
  type PropGroup,
  pastableGroups,
  pasteAnnotationStyle,
  pasteClipProps,
} from "../src/shared/clipProps.ts";
import type { Clip } from "../src/shared/types.ts";

const clip = (o: Partial<Clip> = {}): Clip => ({
  id: "c",
  assetId: "v",
  trackId: "t",
  start: 0,
  in: 0,
  duration: 5,
  volume: 1,
  ...o,
});
const shadow = { distance: 10, angle: 60, blur: 14, opacity: 0.8, color: "#000000" };
const source = clip({
  id: "s",
  transform: {
    x: 0.8,
    y: 0.7,
    scale: 0.4,
    opacity: 0.9,
    mask: "circle",
    border: "#FFFFFF",
    shadow,
  },
  enter: "pop",
  fadeOut: 0.5,
  volume: 0.5,
  denoise: true,
  speed: 2,
});
const copied: CopiedProps = { clip: source, kind: "video", hasAudio: true, name: "cam" };

test("only the chosen groups are copied, and the rest of the target stays", () => {
  const target = clip({
    transform: {
      x: 0.2,
      y: 0.2,
      scale: 1,
      opacity: 1,
      crop: { left: 0.1, top: 0, right: 0, bottom: 0 },
    },
    volume: 0.8,
  });
  const out = pasteClipProps(
    { clip: target, kind: "video", hasAudio: true },
    source,
    new Set<PropGroup>(["position", "shadow"]),
  );
  assert.deepEqual([out.transform!.x, out.transform!.y, out.transform!.scale], [0.8, 0.7, 0.4]);
  assert.deepEqual(out.transform!.shadow, shadow);
  assert.deepEqual(
    out.transform!.crop,
    { left: 0.1, top: 0, right: 0, bottom: 0 },
    "crop not chosen: kept",
  );
  assert.equal(out.transform!.mask, undefined);
  assert.equal(out.volume, 0.8);
  assert.equal(out.enter, undefined);
  assert.equal(out.id, "c");
  assert.equal(out.duration, 5, "speed is applied separately");
});

test("crop, animation and audio come over whole; absent values are cleared", () => {
  const target = clip({
    transform: {
      x: 0.5,
      y: 0.5,
      scale: 1,
      opacity: 1,
      crop: { left: 0.2, top: 0, right: 0, bottom: 0 },
    },
    exit: "fade",
    fadeIn: 1,
  });
  const out = pasteClipProps(
    { clip: target, kind: "video", hasAudio: true },
    source,
    new Set<PropGroup>(["crop", "animation", "audio", "opacity"]),
  );
  assert.equal(out.transform!.crop, undefined);
  assert.equal(out.transform!.mask, "circle");
  assert.equal(out.transform!.border, "#FFFFFF");
  assert.equal(out.transform!.opacity, 0.9);
  assert.equal(out.enter, "pop");
  assert.equal(out.exit, undefined);
  assert.equal(out.fadeIn, undefined);
  assert.equal(out.fadeOut, 0.5);
  assert.deepEqual([out.volume, out.denoise], [0.5, true]);
});

test("groups that do not fit the target are skipped (no volume on a picture)", () => {
  const pic = clip({ assetId: "i" });
  const out = pasteClipProps(
    { clip: pic, kind: "image", hasAudio: false },
    source,
    new Set<PropGroup>(["audio", "position"]),
  );
  assert.equal(out.volume, 1);
  assert.equal(out.transform!.x, 0.8);
  const groups = pastableGroups(copied, [{ clip: pic, kind: "image", hasAudio: false }]);
  assert.ok(
    !groups.includes("audio") && !groups.includes("speed") && !groups.includes("background"),
  );
  assert.ok(groups.includes("position") && groups.includes("shadow"));
});

test("what the copied clip changed starts checked", () => {
  assert.ok(groupIsSet("position", copied));
  assert.ok(groupIsSet("speed", copied));
  assert.ok(!groupIsSet("movement", copied));
  assert.ok(!groupIsSet("transition", copied));
});

test("annotation style keeps the text and geometry", () => {
  const a: Annotation = {
    kind: "balloon",
    text: "Olá",
    color: "#121A30",
    tail: "left",
    width: 500,
  };
  const b: Annotation = {
    kind: "balloon",
    text: "Outro",
    color: "#D92D34",
    fill: "#1B5CF3",
    fontFamily: "Nunito",
    fontSize: 40,
    tail: "right",
    outline: { color: "#FFFFFF", width: 0 },
  };
  const out = pasteAnnotationStyle(a, b);
  assert.deepEqual([out.text, out.tail, out.width], ["Olá", "left", 500]);
  assert.deepEqual(
    [out.color, out.fill, out.fontFamily, out.fontSize],
    ["#D92D34", "#1B5CF3", "Nunito", 40],
  );
  assert.deepEqual(out.outline, { color: "#FFFFFF", width: 0 });
  assert.equal(
    pasteAnnotationStyle(b, a).fill,
    undefined,
    "no fill on the copied one: back to the usual",
  );
});
