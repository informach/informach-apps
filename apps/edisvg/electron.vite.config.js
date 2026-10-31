import { createRequire } from "node:module";
import { resolve } from "node:path";
import { ediBuildOptions } from "@informach/edi-desktop/build";
import { defineConfig } from "electron-vite";
import { runtimePlugin } from "./src/build/runtimePlugin.ts";
export default defineConfig({
  ...ediBuildOptions({
    mainEntry: "src/main/index.js",
    preloadEntry: "src/preload/index.cjs",
    bundledPackages: ["@informach/edi-motion"],
  }),
  renderer: {
    plugins: [
      runtimePlugin(
        createRequire(resolve("package.json")).resolve("@informach/edi-motion/runtime"),
        resolve("src/shared/offlinePlayer.ts"),
        createRequire(resolve("package.json")).resolve("@informach/edi-motion/react"),
        createRequire(resolve("package.json")).resolve("@informach/edi-motion/licenses"),
        createRequire(resolve("package.json")).resolve("@informach/edi-motion/web-player"),
        createRequire(resolve("package.json")).resolve("@informach/edi-motion/web-player/data"),
        createRequire(resolve("package.json")).resolve("@informach/edi-motion/web-player/types"),
      ),
    ],
    root: "src/renderer",
    publicDir: "public",
    build: { rollupOptions: { input: resolve("src/renderer/index.html") } },
  },
});
