import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

if (process.argv.length !== 4) throw new Error("Invalid ledger boundary arguments");
const [metadata, workdir] = process.argv.slice(2);
const meta = JSON.parse(await readFile(metadata, "utf8"));
const permitidos = new Set([
  "scripts/inicializar-livro-direitos.ts",
  "src/lib/rights-environment.ts",
  "src/features/direitos/livro/inicializacao.ts",
  "src/features/direitos/livro/armazenamento.ts",
  "src/features/direitos/livro/assinatura.ts",
  "src/features/direitos/livro/contrato.ts",
  "src/features/direitos/livro/plano-externo.ts",
  "src/features/direitos/preparacao-contrato.ts",
  "src/features/direitos/encerramento-contrato.ts",
  "src/features/direitos/plano-persistido.ts",
]);
if (!meta.inputs || typeof meta.inputs !== "object" || Object.keys(meta.inputs).length === 0)
  throw new Error("Missing ledger bundle inventory");
let entrada = false;
for (const key of Object.keys(meta.inputs)) {
  const path = resolve(workdir, key).replaceAll("\\", "/");
  if (
    /\/(?:packages\/(?:db|auth|billing|morada-sim|morada-arte|jogo-morada)|apps\/(?:admin|morada-server))\//.test(
      path,
    ) ||
    /\/node_modules\/(?:\.pnpm\/)?(?:next@|react@|postgres@|drizzle-orm@|ioredis@)/.test(path)
  )
    throw new Error("Ledger initialization crossed its role boundary");
  const owned = path.split("/apps/recreio/")[1];
  if (owned && !permitidos.has(owned))
    throw new Error("Unreviewed application module in ledger role");
  if (owned === "scripts/inicializar-livro-direitos.ts") entrada = true;
}
if (!entrada) throw new Error("Ledger initialization entry absent");
console.log(
  JSON.stringify({
    formato: "recreio-livro-fronteira-v1",
    bancoIncluido: false,
    autenticacaoIncluida: false,
    cobrancaIncluida: false,
    efeitosPessoaisIncluidos: false,
  }),
);
