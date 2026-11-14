import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("configuração de validação do navegador", () => {
  it("valida sem tentar compilação dinâmica proibida pela CSP", () => {
    const config = new URL("./zod-browser-config.ts", import.meta.url).href;
    const appRoot = fileURLToPath(new URL("../../", import.meta.url));
    const script = `
      let attempts = 0;
      const original = globalThis.Function;
      globalThis.Function = new Proxy(original, {
        apply() { attempts++; throw new Error('CSP'); },
        construct() { attempts++; throw new Error('CSP'); },
      });
      if (process.argv[1] === 'configured') await import(${JSON.stringify(config)});
      const { z } = await import('zod');
      const schema = z.object({ name: z.string() });
      if (!schema.safeParse({ name: 'Helena' }).success) process.exit(2);
      if (schema.safeParse({ name: 1 }).success) process.exit(3);
      process.stdout.write(String(attempts));
    `;
    const run = (mode: string) =>
      spawnSync(process.execPath, ["--input-type=module", "-e", script, mode], {
        cwd: appRoot,
        encoding: "utf8",
      });
    const control = run("unconfigured");
    expect(control.status, control.stderr).toBe(0);
    expect(Number(control.stdout)).toBeGreaterThan(0);
    const configured = run("configured");
    expect(configured.status, configured.stderr).toBe(0);
    expect(configured.stdout).toBe("0");
  });
});
