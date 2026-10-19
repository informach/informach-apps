import { resolve } from "node:path";
import { ediBuildOptions } from "@informach/edi-desktop/build";
import { defineConfig } from "electron-vite";

// The library validates OCR sidecars with the package's result schema: bundle its source into main.
const desktop = ediBuildOptions({
  mainEntry: "src/main/main.cjs",
  preloadEntry: "src/main/preload.cjs",
  bundledPackages: ["@informach/edi-ocr"],
});
export default defineConfig({
  ...desktop,
  main: {
    ...desktop.main,
    build: {
      ...desktop.main.build,
      rollupOptions: {
        ...desktop.main.build.rollupOptions,
        input: {
          main: resolve("src/main/main.cjs"),
          "scroll-worker": resolve("src/main/scroll-worker.ts"),
        },
      },
    },
  },
  renderer: {
    root: "src",
    publicDir: "assets",
    build: {
      rollupOptions: {
        input: {
          editor: resolve("src/editor/index.html"),
          selection: resolve("src/capture/selection.html"),
          control: resolve("src/recording/control.html"),
          frame: resolve("src/capture/frame.html"),
        },
      },
    },
  },
});
