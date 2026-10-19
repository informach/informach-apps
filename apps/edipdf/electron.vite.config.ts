import { resolve } from "node:path";
import { ediBuildOptions } from "@informach/edi-desktop/build";
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";

// task-format (main) imports the OCR result schema: bundle the package source into main.
const desktop = ediBuildOptions({ bundledPackages: ["@informach/edi-ocr"] });
export default defineConfig({
  ...desktop,
  main: {
    ...desktop.main,
    build: {
      ...desktop.main.build,
      rollupOptions: {
        ...desktop.main.build.rollupOptions,
        input: {
          index: resolve("src/main/index.ts"),
          "scanner-pdf-worker": resolve("src/main/scanner-pdf-worker.ts"),
        },
      },
    },
  },
  renderer: {
    resolve: { alias: { "@": resolve("src/renderer/src"), "@shared": resolve("src/shared") } },
    plugins: [react()],
  },
});
