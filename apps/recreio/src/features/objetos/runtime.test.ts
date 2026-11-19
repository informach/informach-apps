import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

it("operador de objetos desligado inicia sem configuração de login, e-mail ou banco do Next", () => {
  const env: NodeJS.ProcessEnv = { ...process.env, RECREIO_OBJECTS_MODE: "off" };
  for (const nome of [
    "DATABASE_URL",
    "BETTER_AUTH_SECRET",
    "BETTER_AUTH_URL",
    "NEXT_PUBLIC_APP_URL",
    "SENDGRID_API_KEY",
    "SENDGRID_FROM",
  ])
    delete env[nome];
  const resultado = spawnSync(
    process.execPath,
    [
      "--conditions=react-server",
      "--import",
      "tsx",
      "--input-type=module",
      "--eval",
      'const {leitorDeFotografias}=await import("./src/features/objetos/runtime.ts"); if(leitorDeFotografias()!==null) throw new Error("reader must be off");',
    ],
    {
      cwd: fileURLToPath(new URL("../../../", import.meta.url)),
      env,
      encoding: "utf8",
      timeout: 15_000,
    },
  );
  expect(resultado.error).toBeUndefined();
  expect(resultado.stderr).toBe("");
  expect(resultado.status).toBe(0);
}, 20_000);
