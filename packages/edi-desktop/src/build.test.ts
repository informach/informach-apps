import { expect, it } from "vitest";
import { ediBuildOptions } from "./build";

it("bundles an explicitly requested workspace package into the Electron main process", () => {
  const packaged = ediBuildOptions({ bundledPackages: ["@informach/edi-motion"] });
  expect(packaged.main.build.externalizeDeps.exclude).toContain("@informach/edi-motion");
  expect(ediBuildOptions().main.build.externalizeDeps.exclude).not.toContain(
    "@informach/edi-motion",
  );
});
