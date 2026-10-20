import { resolve } from "node:path";
import { build } from "vite";
/** IIFE of the raster pipeline and the shared player, for fidelity tests in a real browser. */
export async function rasterTestBundle() {
  const built = await build({
      configFile: false,
      logLevel: "error",
      build: {
        write: false,
        emptyOutDir: false,
        minify: true,
        rolldownOptions: { output: { codeSplitting: false } },
        lib: {
          entry: resolve("tests/rasterBrowser.ts"),
          formats: ["iife"],
          name: "EdiRasterTest",
          fileName: "raster-test",
        },
      },
    }),
    result = Array.isArray(built) ? built[0] : built;
  if (!result || !("output" in result)) throw new Error("Missing raster bundle");
  const chunk = result.output.find((item) => item.type === "chunk");
  if (chunk?.type !== "chunk") throw new Error("Missing raster chunk");
  return chunk.code;
}
