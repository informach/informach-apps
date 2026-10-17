import { resolve } from "node:path";
import { ediBuildOptions } from "@informach/edi-desktop/build";
import { defineConfig } from "electron-vite";
export default defineConfig({
  ...ediBuildOptions({ mainEntry: "src/main/main.cjs", preloadEntry: "src/main/preload.cjs" }),
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
