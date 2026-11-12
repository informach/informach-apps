import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * A bancada: uma página de desenvolvimento que joga contra o servidor do jogo
 * no modo `falsa` (porta 3010). Não é o build do package, que não tem build:
 * é ferramenta de desenvolvimento e de teste, e a saída dela é ignorada pelo git.
 *
 * A porta é fixa porque o servidor de desenvolvimento só aceita o WebSocket
 * de `http://localhost:5173`.
 */
const aqui = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: aqui,
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  preview: { port: 5173, strictPort: true },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    // O manifesto diz quais arquivos cada página carrega: é por ele que o teste
    // confere o tamanho do jogo e que a página da marca não puxa o three.js.
    manifest: true,
    rollupOptions: {
      input: {
        jogo: fileURLToPath(new URL("./index.html", import.meta.url)),
        marca: fileURLToPath(new URL("./marca.html", import.meta.url)),
      },
    },
  },
});
