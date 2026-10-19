import { readFile } from "node:fs/promises";
import { build, type Plugin } from "vite";

/** Publish the same pure runtime as ESM for hosts and IIFE for single-file HTML.
 * Nested builds never write output or load app environment/configuration. */
export function runtimePlugin(
  entry: string,
  offlineEntry: string,
  reactEntry: string,
  licensesEntry: string,
): Plugin {
  let productionBuild = false;
  async function bundle(kind: "es" | "iife" | "react") {
    const format = kind === "react" ? "es" : kind;
    const result = await build({
      configFile: false,
      mode: productionBuild ? "production" : "development",
      logLevel: "error",
      build: {
        write: false,
        emptyOutDir: false,
        minify: true,
        rolldownOptions: {
          external: kind === "react" ? ["react", "react/jsx-runtime", "react/jsx-dev-runtime"] : [],
          output: { codeSplitting: false },
        },
        lib: {
          entry: kind === "react" ? reactEntry : format === "es" ? entry : offlineEntry,
          formats: [format],
          name: "EdiSVGRuntime",
          fileName: "edi-player",
        },
      },
    });
    const output = Array.isArray(result) ? result[0] : result;
    if (!output || !("output" in output)) throw new Error("Runtime build did not return output.");
    const chunk = output.output.find((item) => item.type === "chunk");
    if (
      chunk?.type !== "chunk" ||
      output.output.filter((item) => item.type === "chunk").length !== 1 ||
      output.output.some(
        (item) =>
          item.type === "chunk" &&
          (item.imports.some(
            (name) =>
              kind !== "react" ||
              !["react", "react/jsx-runtime", "react/jsx-dev-runtime"].includes(name),
          ) ||
            item.dynamicImports.length),
      )
    )
      throw new Error(
        `The standalone runtime must be a single self-contained module (${format}): ${JSON.stringify(output.output.map((item) => (item.type === "chunk" ? { file: item.fileName, imports: item.imports, dynamicImports: item.dynamicImports } : { asset: item.fileName })))}`,
      );
    return kind === "react" ? `"use client";\n${chunk.code}` : chunk.code;
  }
  const names = {
    es: "edi-player.mjs",
    iife: "edi-player.global.js",
    react: "edi-react-player.mjs",
  };
  return {
    name: "edi-svg-runtime",
    configResolved(config) {
      productionBuild = config.command === "build";
    },
    async buildStart() {
      if (!productionBuild) return;
      this.emitFile({
        type: "asset",
        fileName: "edi-player.licenses.txt",
        source: await readFile(licensesEntry, "utf8"),
      });
      for (const format of ["es", "iife", "react"] as const) {
        this.emitFile({ type: "asset", fileName: names[format], source: await bundle(format) });
      }
    },
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const path = request.url?.split("?")[0];
        if (path === "/edi-player.licenses.txt") {
          try {
            response.setHeader("Content-Type", "text/plain; charset=utf-8");
            response.end(await readFile(licensesEntry, "utf8"));
          } catch (error) {
            next(error);
          }
          return;
        }
        const format =
          path === "/edi-player.mjs"
            ? "es"
            : path === "/edi-player.global.js"
              ? "iife"
              : path === "/edi-react-player.mjs"
                ? "react"
                : null;
        if (!format) {
          next();
          return;
        }
        try {
          response.setHeader("Content-Type", "text/javascript");
          response.end(await bundle(format));
        } catch (error) {
          next(error);
        }
      });
    },
  };
}
