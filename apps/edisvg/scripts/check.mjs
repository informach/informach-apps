import { spawnSync } from "node:child_process";
import { readdir } from "node:fs/promises";

async function check(dir) {
  for (const file of await readdir(dir, { withFileTypes: true })) {
    const path = `${dir}/${file.name}`;
    if (file.isDirectory()) await check(path);
    else if (/\.(js|cjs|mjs)$/.test(file.name)) {
      const result = spawnSync(process.execPath, ["--check", path], { stdio: "inherit" });
      if (result.status) process.exit(result.status);
    }
  }
}
await check("src");
await check("scripts");
console.log("Sintaxe verificada.");
