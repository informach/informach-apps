import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { createServer } from "vite";

const server = await createServer({
  configFile: false,
  root: resolve("."),
  plugins: [react()],
  resolve: { alias: { "@": resolve("src/renderer/src"), "@shared": resolve("src/shared") } },
  server: { host: "127.0.0.1", port: 5184, strictPort: true },
});
await server.listen();
console.log("Editor test harness: http://127.0.0.1:5184/tests/browser/index.html");
