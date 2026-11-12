import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ANNOTATION_PRESETS,
  type Annotation,
  balloonLook,
  balloonPath,
  balloonTail,
  defaultOutline,
  ICON_IDS,
  KIT,
  textBoxLayout,
} from "../src/shared/annotation.ts";
import { DEFAULT_FONT, fontStack } from "../src/shared/fonts.ts";
import {
  colorMapper,
  contrast,
  EDIAULA_PALETTE,
  fontRole,
  inPalette,
  mixHex,
  readableOn,
  recolorAnnotation,
  refont,
  SISTEMA_ZERO_PALETTE,
  slideColors,
  themeFontSet,
} from "../src/shared/palettes.ts";
import { annotationFont } from "../src/shared/preflight.ts";
import { annotationSchema } from "../src/shared/project-schema.ts";
import { revealKind, revealWords } from "../src/shared/reveal.ts";

const preset = (kind: string) => ANNOTATION_PRESETS.find((p) => p.kind === kind)!.spec;

test("the box and the item are presets that come in the project's palette", () => {
  const box = inPalette(preset("box"), SISTEMA_ZERO_PALETTE);
  assert.equal(box.color, "#FFFFFF");
  assert.equal(box.badge, "1");
  assert.equal(box.pointer, "down");
  const item = inPalette(preset("item"), SISTEMA_ZERO_PALETTE);
  assert.equal(item.color, "#1B5CF3");
  assert.equal(item.fill, "#FFFFFF");
});

test("a box is the kit's: heavy centered text, its own size, text color by background or chosen", () => {
  const white = textBoxLayout({ kind: "box", color: "#FFFFFF", ink: "#0F1A33" });
  assert.equal(white.fontSize, KIT.boxText);
  assert.equal(white.align, "center");
  assert.equal(white.textColor, "#0F1A33");
  assert.deepEqual([white.padX, white.padY], [42, 24]);
  const green = textBoxLayout({ kind: "box", color: "#0B7A54", textColor: "#FFC02E" });
  assert.equal(green.textColor, "#FFC02E");
  assert.equal(textBoxLayout({ kind: "box", color: "#121A30" }).textColor, "#FFFFFF");
  // A box of a set width wraps inside it; left alignment is a choice.
  assert.equal(textBoxLayout({ kind: "box", color: "#FFFFFF", boxWidth: 405 }).maxWidth, 321);
  assert.equal(textBoxLayout({ kind: "box", color: "#FFFFFF", layout: "left" }).align, "left");
  // Notes keep their own look.
  assert.equal(textBoxLayout({ kind: "note", color: "#FFFFFF" }).align, "left");
});

test("the project file keeps the new fields and refuses wrong ones", () => {
  const item: Annotation = {
    kind: "item",
    color: "#1B5CF3",
    fill: "#FFFFFF",
    text: "Mover o personagem",
    subtitle: "com as setas",
    kicker: "Meta",
    badge: "1",
    icon: "gamepad",
    marker: "circle",
    bare: false,
    bodyFont: "Nunito",
    textColor: "#0F1A33",
    textRole: "heading",
  };
  assert.ok(annotationSchema.safeParse(item).success);
  const box = { kind: "box", color: "#FFFFFF", pointer: "left", pointerAt: 0.3, badge: "12" };
  assert.ok(annotationSchema.safeParse(box).success);
  assert.equal(annotationSchema.safeParse({ ...box, badge: "1234" }).success, false);
  assert.equal(annotationSchema.safeParse({ ...box, pointerAt: 2 }).success, false);
  assert.equal(annotationSchema.safeParse({ ...item, icon: "unicorn" }).success, false);
  assert.ok(ICON_IDS.includes("pause") && ICON_IDS.includes("check"));
});

test("the check before exporting reads the box's and the item's letters", () => {
  assert.deepEqual(annotationFont({ kind: "box", color: "#FFFFFF", text: "Ação" }), {
    size: KIT.boxText,
    fixed: false,
  });
  assert.deepEqual(
    annotationFont({ kind: "item", color: "#FFFFFF", text: "Abra", subtitle: "No Estúdio" }),
    { size: KIT.itemSub, fixed: true },
  );
  assert.equal(annotationFont({ kind: "item", color: "#FFFFFF" }), null);
  // Every text the kit draws is at least the readable 36 px.
  assert.ok(Math.min(KIT.boxText, KIT.itemText, KIT.itemSub) >= 36);
});

test("boxes and items come in word by word; an item says its line below after its text", () => {
  assert.equal(revealKind({ kind: "box" }), "words");
  assert.deepEqual(revealWords({ kind: "item", text: "Abra o jogo", subtitle: "no Estúdio" }), [
    "Abra",
    "o",
    "jogo",
    "no",
    "Estúdio",
  ]);
});

test("switching palettes moves the text color, the kicker and the slide colors too", () => {
  const map = colorMapper([EDIAULA_PALETTE], SISTEMA_ZERO_PALETTE);
  const reaction = recolorAnnotation(
    { kind: "box", color: "#2FBF71", textColor: "#C8F031" },
    map,
    SISTEMA_ZERO_PALETTE,
  );
  assert.deepEqual([reaction.color, reaction.textColor], ["#0B7A54", "#FFC02E"]);
  const next = recolorAnnotation(
    { kind: "item", color: "#3D6BFF", fill: "#12140A", accent: "#C8F031" },
    map,
    SISTEMA_ZERO_PALETTE,
  );
  assert.deepEqual([next.color, next.fill, next.accent], ["#1B5CF3", "#121A30", "#FFC02E"]);
  // A template's page in EdiAula becomes the kit's page.
  assert.equal(map(slideColors(EDIAULA_PALETTE).page), "#E9EEF6");
  assert.equal(map(slideColors(EDIAULA_PALETTE).muted), "#46536E");
});

test("theme fonts: boxes and items take the title font, an item's line below the text font", () => {
  assert.equal(fontRole("box"), "heading");
  assert.equal(fontRole("item"), "heading");
  assert.equal(fontRole({ kind: "title", textRole: "body" }), "body");
  const themed = themeFontSet([EDIAULA_PALETTE, SISTEMA_ZERO_PALETTE]);
  const item = refont({ kind: "item", color: "#1B5CF3" }, SISTEMA_ZERO_PALETTE, themed);
  assert.deepEqual([item.fontFamily, item.bodyFont], ["Baloo 2", "Nunito"]);
  // Back to the default typeface: both go; a font picked by hand stays.
  const plain = refont(item, null, themed);
  assert.equal("fontFamily" in plain || "bodyFont" in plain, false);
  const own = refont({ ...item, bodyFont: "Fredoka" }, null, themed);
  assert.equal(own.bodyFont, "Fredoka");
});

test("slide colors and readable text", () => {
  assert.deepEqual(slideColors(SISTEMA_ZERO_PALETTE), {
    page: "#E9EEF6",
    muted: "#46536E",
    soft: "#FFEDC4",
  });
  assert.equal(mixHex("#000000", "#FFFFFF", 0.5), "#808080");
  assert.ok(contrast("#000000", "#FFFFFF") > 20);
  // The kit's yellow on its green reads (big bold letters); lime on EdiAula's green does not.
  assert.equal(readableOn("#FFC02E", "#0B7A54", SISTEMA_ZERO_PALETTE), "#FFC02E");
  assert.equal(readableOn("#C8F031", "#2FBF71", EDIAULA_PALETTE), "#FFFFFF");
});

test("a balloon in the kit's look: no outline, heavy centered text, round corners, straight tail", () => {
  const kit: Annotation = { kind: "balloon", look: "kit", color: "#0F1A33", fill: "#FFFFFF" };
  assert.equal(defaultOutline(kit).width, 0);
  assert.equal(defaultOutline({ kind: "balloon", color: "#0F1A33" }).width, 3);
  const box = textBoxLayout(kit);
  assert.deepEqual([box.fontSize, box.align, box.padX, box.padY], [KIT.boxText, "center", 42, 24]);
  assert.deepEqual(balloonLook(kit), { radius: KIT.radius, straight: true });
  // The kit's tail is two straight lines; the comic's bends.
  const straight = balloonPath(0, 0, 300, 100, 30, 40, "bottom-left", undefined, true);
  const comic = balloonPath(0, 0, 300, 100, 16, 40, "bottom-left");
  assert.equal((straight.match(/Q/g) ?? []).length, 4);
  assert.ok((comic.match(/Q/g) ?? []).length > 4);
  // Short and square out of its side, with the kit pointer's base (36 of 40 × 0.45 × 2).
  const tail = balloonTail(0, 0, 300, 100, 30, 40, "bottom-left", undefined, true);
  assert.equal(tail.tip.x, tail.base.x);
  assert.equal(tail.tip.y, 100 + 22);
  assert.equal(tail.b * 2, 36);
  // The check before exporting reads its bigger letters, and the file keeps the look.
  assert.equal(annotationFont({ ...kit, text: "Olá" })?.size, KIT.boxText);
  assert.ok(annotationSchema.safeParse({ ...kit, badge: "1" }).success);
  assert.equal(annotationSchema.safeParse({ ...kit, look: "neon" }).success, false);
});

test("the default typeface of annotations and templates is Baloo 2, with the app's as the fallback", () => {
  assert.equal(DEFAULT_FONT, "Baloo 2");
  assert.equal(
    fontStack(),
    '"Baloo 2", "Plus Jakarta Sans Variable", "Plus Jakarta Sans", sans-serif',
  );
  assert.ok(fontStack("Nunito").startsWith('"Nunito", "Baloo 2",'));
});
