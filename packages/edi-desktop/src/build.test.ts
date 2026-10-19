import { expect, test } from "vitest";
import { ediBuildOptions } from "./build";

test("source packages are explicitly bundled without changing other app defaults", () => {
  const defaults = ediBuildOptions();
  const svg = ediBuildOptions({ bundledPackages: ["@informach/edi-motion"] });
  expect(defaults.main.build.externalizeDeps.exclude).not.toContain("@informach/edi-motion");
  expect(svg.main.build.externalizeDeps.exclude).toEqual([
    ...defaults.main.build.externalizeDeps.exclude,
    "@informach/edi-motion",
  ]);
  expect(svg.main.build.rollupOptions.external).toEqual(["original-fs"]);
  expect(svg.preload).toEqual(defaults.preload);
});
