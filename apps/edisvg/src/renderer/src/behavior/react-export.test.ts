import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { strFromU8, unzipSync } from "fflate";
import { newProject } from "../../../shared/project";
import { buildReactExport } from "./react-export";

test("React archive is deterministic, bounded, contains only known filenames and refuses unavailable runtimes", async () => {
  const project = newProject(),
    options = { format: "react", alt: "Arte", reduced: true, offscreen: true },
    runtime =
      '"use client";export const EdiSvgPlayer=undefined;export const VisualArtwork=undefined;',
    licenses = await readFile("../../packages/edi-motion/THIRD_PARTY_LICENSES.txt", "utf8");
  const first = buildReactExport(project, options, runtime, licenses),
    second = buildReactExport(project, options, runtime, licenses);
  assert.deepEqual(first.content, second.content);
  const files = unzipSync(first.content);
  assert.deepEqual(
    Object.keys(files).sort(),
    [
      "EdiAnimation.jsx",
      "EdiAnimation.d.ts",
      "edi-react-player.mjs",
      "README.md",
      "THIRD_PARTY_LICENSES.txt",
      "NextExample.tsx",
    ].sort(),
  );
  assert.match(strFromU8(files["EdiAnimation.jsx"] ?? new Uint8Array()), /machineId:undefined/);
  assert.throws(() => buildReactExport(project, options, "", licenses), /indisponíveis/);
  assert.throws(() => buildReactExport(project, { ...options, alt: "" }, runtime, licenses));
  assert.throws(
    () => buildReactExport(project, options, runtime + " ".repeat(10000000), licenses),
    /10 MB/,
  );
});
