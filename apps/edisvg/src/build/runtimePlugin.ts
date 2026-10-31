import { readFile } from "node:fs/promises";
import { build, type Plugin } from "vite";

/** Publish the same pure runtime as ESM for hosts and IIFE for single-file HTML.
 * Nested builds never write output or load app environment/configuration. */
export function runtimePlugin(
  entry: string,
  offlineEntry: string,
  reactEntry: string,
  licensesEntry: string,
  webEntry: string,
  dataEntry: string,
  typesEntry: string,
): Plugin {
  let productionBuild = false;
  async function bundle(kind: "es" | "iife" | "react" | "web" | "data") {
    const format = kind === "iife" ? "iife" : "es";
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
          entry:
            kind === "react"
              ? reactEntry
              : kind === "web"
                ? webEntry
                : kind === "data"
                  ? dataEntry
                  : format === "es"
                    ? entry
                    : offlineEntry,
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
    web: "edi-web-player.mjs",
    data: "edi-web-data.mjs",
  };
  const declarations = {
    "edi-web-types.d.ts": () => readFile(typesEntry, "utf8"),
    "edi-web-data.d.mts": () =>
      Promise.resolve(
        'import type { WebAnimationInfo } from "./edi-web-types.js";\nexport declare function normalizeWebAnimation(input: unknown): string;\nexport declare function readWebAnimation(input: unknown): WebAnimationInfo;\nexport declare function webAnimationPoster(input: unknown): { bytes: Uint8Array; width: number; height: number; mime: "image/png" } | null;\n',
      ),
    "edi-web-player.d.mts": () =>
      Promise.resolve(
        'export * from "./edi-web-data.mjs";\nexport type * from "./edi-web-types.js";\nimport type { WebAnimationHandle, WebAnimationOptions } from "./edi-web-types.js";\nexport declare function mountWebAnimation(root: SVGSVGElement, input: unknown, options?: WebAnimationOptions): Promise<WebAnimationHandle>;\n',
      ),
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
      for (const format of ["es", "iife", "react", "web", "data"] as const) {
        this.emitFile({ type: "asset", fileName: names[format], source: await bundle(format) });
      }
      for (const [fileName, source] of Object.entries(declarations))
        this.emitFile({ type: "asset", fileName, source: await source() });
    },
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const path = request.url?.split("?")[0];
        const declaration = Object.entries(declarations).find(([name]) => path === `/${name}`);
        if (declaration) {
          try {
            response.setHeader("Content-Type", "text/plain; charset=utf-8");
            response.end(await declaration[1]());
          } catch (error) {
            next(error);
          }
          return;
        }
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
                : path === "/edi-web-player.mjs"
                  ? "web"
                  : path === "/edi-web-data.mjs"
                    ? "data"
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
