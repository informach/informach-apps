import { configuracaoDaConciliacaoDeRastros } from "../src/lib/world-trace-reconciliation-environment";

async function main() {
  if (process.argv.length !== 2) throw new Error("Unexpected reconciliation arguments");
  const config = configuracaoDaConciliacaoDeRastros(process.env);
  if (!config) {
    console.log(JSON.stringify({ formato: "recreio-world-traces-v1", modo: "off" }));
    return;
  }
  if (process.platform !== "linux") throw new Error("Railway Linux process required");
  const { db, checkSchemaReadiness } = await import("@informach/db");
  try {
    if (!(await checkSchemaReadiness()).ok) throw new Error("Schema not ready");
    const { reconciliarRastrosLegados } = await import(
      "../src/features/direitos/rastros-legados-repository"
    );
    const resultado = await reconciliarRastrosLegados(config.modo);
    console.log(
      JSON.stringify({
        formato: "recreio-world-traces-v1",
        modo: config.modo,
        source: config.fonte,
        ok: true,
        ...resultado,
      }),
    );
  } finally {
    await db.$client.end({ timeout: 5 });
  }
}
void main().catch(() => {
  console.error(
    JSON.stringify({
      formato: "recreio-world-traces-v1",
      ok: false,
      codigo: "RECONCILIATION_FAILED",
    }),
  );
  process.exitCode = 1;
});
