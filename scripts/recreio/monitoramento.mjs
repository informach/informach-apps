import { pathToFileURL } from "node:url";
import { executarMonitoramento, FalhaDaSonda } from "./sonda.mjs";

async function executar() {
  const prova = process.argv.slice(2).join(" ") === "--provar-transporte";
  if (process.argv.length > 2 && !prova) throw new FalhaDaSonda("ARGUMENTOS");
  if (!(await executarMonitoramento(process.env, { prova }))) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  executar().catch((erro) => {
    console.log(
      JSON.stringify({ ok: false, codigo: erro instanceof FalhaDaSonda ? erro.codigo : "INTERNO" }),
    );
    process.exitCode = 1;
  });
}
