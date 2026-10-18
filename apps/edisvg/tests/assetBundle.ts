import { resolve } from "node:path";
import { build } from "vite";
export async function assetTestBundle() {
  const built = await build({
      configFile: false,
      logLevel: "error",
      build: {
        write: false,
        emptyOutDir: false,
        minify: true,
        rolldownOptions: { output: { codeSplitting: false } },
        lib: {
          entry: resolve("tests/assetBrowser.ts"),
          formats: ["iife"],
          name: "EdiAssetTest",
          fileName: "asset-test",
        },
      },
    }),
    result = Array.isArray(built) ? built[0] : built;
  if (!result || !("output" in result)) throw new Error("Missing assets bundle");
  const chunk = result.output.find((item) => item.type === "chunk");
  if (chunk?.type !== "chunk") throw new Error("Missing assets chunk");
  return chunk.code;
}
