import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Cada arquivo tem seu servidor e mundo. Nomes de outros cenários não ocupam
// vagas nem deixam votos, reservas ou relógios para a próxima jornada.
if (process.argv.length > 2)
  throw new Error(
    "Para seleção focada, use pnpm exec playwright test --config e2e/playwright.config.ts.",
  );
const pacote = fileURLToPath(new URL("..", import.meta.url));
const cli = createRequire(import.meta.url).resolve("@playwright/test/cli");
function arquivos(pasta, prefixo = "") {
  return readdirSync(pasta, { withFileTypes: true }).flatMap((entrada) => {
    const nome = join(prefixo, entrada.name);
    if (entrada.isDirectory())
      return ["test-results", "telas"].includes(entrada.name)
        ? []
        : arquivos(join(pasta, entrada.name), nome);
    return entrada.isFile() && entrada.name.endsWith(".spec.ts") ? [nome] : [];
  });
}
const suites = arquivos(join(pacote, "e2e")).sort();
if (suites.length === 0) throw new Error("Nenhuma jornada de navegador encontrada.");
for (const [indice, suite] of suites.entries()) {
  console.log(`Mundo isolado para ${suite}`);
  const filtro = `${suite.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`;
  const resultado = spawnSync(
    process.execPath,
    [cli, "test", "--config", "e2e/playwright.config.ts", filtro],
    {
      cwd: pacote,
      stdio: "inherit",
      env: {
        ...process.env,
        MORADA_E2E_GRUPO: `suite-${indice + 1}`,
        // O mesmo checkout imutável; só a primeira execução constrói a bancada.
        MORADA_E2E_BUILD_PRONTO: indice === 0 ? "" : "1",
      },
    },
  );
  if (resultado.error) throw resultado.error;
  if (resultado.status !== 0) process.exit(resultado.status ?? 1);
}
