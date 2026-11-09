import { resolve } from "node:path";
import { ediBuildOptions } from "@informach/edi-desktop/build";
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";

export default defineConfig({
  ...ediBuildOptions({ bundledPackages: ["@informach/edi-speech"] }),
  renderer: {
    resolve: { alias: { "@": resolve("src/renderer/src"), "@shared": resolve("src/shared") } },
    plugins: [react()],
  },
});
