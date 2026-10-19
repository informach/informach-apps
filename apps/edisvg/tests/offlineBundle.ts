import { resolve } from "node:path";
import { build } from "vite";
/** Actual production compilation; no stub runtime and no dependency on out/. */
export async function offlineBundle() {
  const result = await build({
    configFile: false,
    logLevel: "error",
    build: {
      write: false,
      emptyOutDir: false,
      minify: true,
      rolldownOptions: { output: { codeSplitting: false } },
      lib: {
        entry: resolve("src/shared/offlinePlayer.ts"),
        formats: ["iife"],
        name: "EdiSVGRuntime",
        fileName: "edi-player",
      },
    },
  });
  const output = Array.isArray(result) ? result[0] : result;
  if (!output || !("output" in output)) throw new Error("No test offline bundle");
  const chunk = output.output.find((item) => item.type === "chunk");
  if (chunk?.type !== "chunk") throw new Error("No test offline module");
  return chunk.code;
}
