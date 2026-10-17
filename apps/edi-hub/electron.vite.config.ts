import { ediBuildOptions } from "@informach/edi-desktop/build";
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";
export default defineConfig({
  ...ediBuildOptions(),
  renderer: {
    plugins: [react()],
    // The renderer CSP only allows fonts from 'self'; emit every font subset as a
    // file instead of inlining small ones as data: URIs that the policy blocks.
    build: { assetsInlineLimit: 0 },
  },
});
