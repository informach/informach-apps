import { ediBuildOptions } from "@informach/edi-desktop/build";
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";
export default defineConfig({ ...ediBuildOptions(), renderer: { plugins: [react()] } });
