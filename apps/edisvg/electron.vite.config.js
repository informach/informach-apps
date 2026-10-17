import { resolve } from "node:path";
import { ediBuildOptions } from "@informach/edi-desktop/build";
import { defineConfig } from "electron-vite";
export default defineConfig({
  ...ediBuildOptions({ mainEntry: "src/main/index.js", preloadEntry: "src/preload/index.cjs" }),
  renderer: {
    root: "src/renderer",
    publicDir: "public",
    build: { rollupOptions: { input: resolve("src/renderer/index.html") } },
  },
});
