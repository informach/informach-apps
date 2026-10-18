import assert from "node:assert/strict";
import { test } from "node:test";
import { AI_TOOL_NAMES, AI_TOOLS, MUTATING_TOOLS, toolJsonSchema } from "../src/shared/aiTools.ts";
import {
  BLEND_GROUPS,
  BLEND_IDS,
  BLEND_MODES,
  blendIndex,
  cycleBlend,
  FAVORITE_MODES,
} from "../src/shared/blendModes.ts";
import { adjustSummary, DEFAULT_ADJUST, isNeutral, rotatePoint } from "../src/shared/doc.ts";

test("all 27 Photoshop blend modes, unique, grouped, in shader order", () => {
  assert.equal(BLEND_MODES.length, 27);
  assert.equal(new Set(BLEND_IDS).size, 27);
  for (const m of BLEND_MODES)
    assert.ok(
      BLEND_GROUPS.some((g) => g.id === m.group),
      m.id,
    );
  // The shader switches on these indices (engine/shaders.ts).
  assert.equal(blendIndex("normal"), 0);
  assert.equal(blendIndex("dissolve"), 1);
  assert.equal(blendIndex("overlay"), 12);
  assert.equal(blendIndex("luminosity"), 26);
  for (const f of FAVORITE_MODES) assert.ok(BLEND_IDS.includes(f));
});

test("Shift +/- cycles and wraps around", () => {
  assert.equal(cycleBlend("normal", 1), "dissolve");
  assert.equal(cycleBlend("normal", -1), "luminosity");
  assert.equal(cycleBlend("luminosity", 1), "normal");
});

test("every AI tool has a valid JSON schema for personal MCP clients", () => {
  for (const name of AI_TOOL_NAMES) {
    const s = toolJsonSchema(name);
    assert.equal(s.type, "object", name);
    assert.ok(!("$schema" in s), name);
    assert.ok(AI_TOOLS[name].description.length > 30, name);
  }
  for (const m of MUTATING_TOOLS) assert.ok(AI_TOOL_NAMES.includes(m));
});

test("tool inputs are validated", () => {
  assert.ok(
    AI_TOOLS.set_layer.input.safeParse({ layer_id: "a", blend_mode: "overlay", opacity: 80 })
      .success,
  );
  assert.ok(!AI_TOOLS.set_layer.input.safeParse({ layer_id: "a", blend_mode: "sobrepor" }).success);
  assert.ok(!AI_TOOLS.set_layer.input.safeParse({ layer_id: "a", opacity: 150 }).success);
  assert.ok(
    AI_TOOLS.add_layer.input.safeParse({
      kind: "gradient",
      gradient: {
        stops: [
          { color: "#000000", position: 0 },
          { color: "#ffffff", position: 1 },
        ],
      },
    }).success,
  );
  assert.ok(!AI_TOOLS.add_layer.input.safeParse({ kind: "solid", color: "red" }).success);
  assert.ok(AI_TOOLS.crop.input.safeParse({ aspect: "4:5" }).success);
  assert.ok(!AI_TOOLS.crop.input.safeParse({ aspect: "quadrado" }).success);
  assert.ok(AI_TOOLS.transform_image.input.safeParse({ rotate: -90 }).success);
  assert.ok(!AI_TOOLS.transform_image.input.safeParse({ rotate: 45 }).success);
});

test("adjustment summaries and neutral detection", () => {
  assert.ok(isNeutral(DEFAULT_ADJUST));
  assert.equal(adjustSummary(DEFAULT_ADJUST), "neutro");
  const a = { ...DEFAULT_ADJUST, exposure: -0.6, contrast: 30, grayscale: true };
  assert.ok(!isNeutral(a));
  assert.equal(adjustSummary(a), "exposição -0.6 EV, contraste +30, preto e branco");
});

test("rotating the image moves points like a 90° turn", () => {
  // 400×200 image: the top-left corner goes to the top-right when turned clockwise.
  assert.deepEqual(rotatePoint(0, 0, 400, 200, 1), [200, 0]);
  assert.deepEqual(rotatePoint(0, 0, 400, 200, -1), [0, 400]);
  const [x, y] = rotatePoint(100, 50, 400, 200, 1);
  assert.deepEqual(rotatePoint(x, y, 200, 400, -1), [100, 50]);
});
