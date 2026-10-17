import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.env.PORT ??= "3006";
if (
  !/^\d+$/.test(process.env.PORT) ||
  Number(process.env.PORT) < 1 ||
  Number(process.env.PORT) > 65535
)
  throw new Error("PORT must be a valid TCP port");
process.env.HOSTNAME ??= "0.0.0.0";
await import(pathToFileURL(resolve(root, ".next/standalone/apps/edi/server.js")).href);
