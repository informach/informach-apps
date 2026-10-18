import assert from "node:assert/strict";
import { test } from "node:test";
import { emptyBehavior } from "@informach/edi-motion/behavior";
import { offlineBundle } from "../../../../tests/offlineBundle";
import { newProject } from "../../../shared/project";
import { buildExport } from "../export.js";
import { buildInteractiveExport } from "./export";

test("interactive export preserves declarative logic, escapes authored data and requires explicit loss consent for animation-only formats", async () => {
  const project = newProject(),
    board = project.artboards[0];
  if (!board) throw new Error("Missing artboard");
  project.motion.animations = [
    { id: "animation-main", name: "Parado", fps: 60, frames: 60, mode: "once", tracks: [] },
  ];
  board.behavior = {
    ...emptyBehavior(),
    defaultMachineId: "machine-main",
    inputs: [
      {
        id: "input-name",
        kind: "string",
        name: "Nome",
        initial: "</script><script>not executable</script>",
      },
    ],
    machines: [
      {
        id: "machine-main",
        name: "Interação",
        layers: [
          {
            id: "layer-main",
            name: "Corpo",
            entryStateId: "state-main",
            mode: "override",
            weight: 1,
            properties: ["x"],
            targetIds: [],
            states: [
              {
                id: "state-main",
                kind: "animation",
                animationId: "animation-main",
                name: "Parado",
                speed: 1,
                x: 0,
                y: 0,
              },
            ],
            transitions: [],
          },
        ],
      },
    ],
  };
  const options = { alt: 'Arte <&> "$&"', reduced: true, offscreen: true },
    bundle = await offlineBundle(),
    output = buildInteractiveExport(
      project,
      { ...options, format: "interactive-html", fit: "cover" },
      bundle,
    );
  assert.equal(output.extension, "html");
  assert.match(output.content, /preserveAspectRatio="xMidYMid slice"/);
  assert.match(output.content, /\\u003c\/script>/);
  assert.doesNotMatch(output.content, /<script>not executable/);
  assert.match(output.content, /Arte &lt;&amp;&gt; &quot;\$&amp;&quot;/);
  for (const format of ["html", "svg"])
    assert.throws(() => buildExport(project, { ...options, format }, "", bundle), /confirme/);
  assert.equal(
    JSON.parse(
      buildExport({ ...project, activeClipId: "animation-missing" }, { ...options, format: "json" })
        .content,
    ).artboards[0].behavior.inputs[0].initial,
    board.behavior.inputs[0]?.kind === "string" ? board.behavior.inputs[0].initial : "",
  );
  assert.throws(
    () =>
      buildInteractiveExport(
        project,
        { ...options, format: "interactive-html", machineId: "machine-missing" },
        bundle,
      ),
    /máquina/,
  );
});
