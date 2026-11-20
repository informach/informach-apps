import { readFile, writeFile } from "node:fs/promises";
import postgres from "postgres";
import { z } from "zod";

const numero = z.number().finite().nonnegative();
const inteiro = numero.int().max(Number.MAX_SAFE_INTEGER);
const Latencia = z.strictObject({ p50: numero, p95: numero, p99: numero, max: numero });
const Resultado = z.strictObject({
  simultaneos: z.union([z.literal(1), z.literal(2), z.literal(4), z.literal(8)]),
  mundos: z.literal(1),
  duracaoMs: numero.min(60000),
  rodadas: inteiro.min(1),
  comandos: inteiro.min(1),
  comandosPorSegundo: numero,
  latenciaRodadaMs: Latencia,
  servidorTitulo: z.strictObject({
    cpuMicros: inteiro,
    cpuNucleosMedios: numero,
    rssMaxAmostrado: inteiro.min(1),
  }),
  horasMundo: numero.positive(),
  horasJogador: numero.positive(),
  diarioPersistido: inteiro,
  contadorRecuperado: inteiro,
  fotografiaBytes: inteiro.min(1),
  diarioBytes: inteiro,
  bancoBytes: inteiro.min(1),
  erros: z.literal(0),
});
const Recibo = z.strictObject({
  formato: z.literal("recreio-capacidade-protocolo-v1"),
  source: z.string().regex(/^[a-f0-9]{40}$/),
  runId: z.string().regex(/^\d+$/),
  node: z.string(),
  plataforma: z.literal("linux"),
  arquitetura: z.string(),
  cpus: z.array(z.strictObject({ modelo: z.string(), velocidade: numero })).min(1),
  memoriaExecutor: inteiro.positive(),
  bancoBaseBytes: inteiro.positive(),
  resultados: z.array(Resultado).length(4),
  recuperacaoAposReinicio: z.literal(true),
  bancoDescartavel: z.literal(true),
  productionDataTouched: z.literal(false),
  limitesDesligados: z.literal(false),
  limites: z.array(z.string()).min(5),
  bancoDescartavelLimpo: z.literal(true).optional(),
  conferidoEm: z.iso.datetime().optional(),
});

if (
  process.env.GITHUB_ACTIONS !== "true" ||
  process.env.CI !== "true" ||
  process.env.GITHUB_REPOSITORY !== "informach/informach-apps"
)
  throw new Error("Only isolated GitHub verification allowed");
const url = new URL(process.env.DATABASE_URL ?? "");
if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.pathname !== "/ci")
  throw new Error("Isolated administration database required");
const path = "tmp/telas/recreio-capacidade-protocolo.json";
const bytes = await readFile(path);
if (bytes.byteLength > 256 * 1024) throw new Error("Capacity receipt exceeds limit");
const recibo = Recibo.parse(JSON.parse(bytes.toString("utf8")));
if (
  recibo.source !== process.env.GITHUB_SHA ||
  recibo.runId !== process.env.GITHUB_RUN_ID ||
  recibo.resultados.map((r) => r.simultaneos).join() !== "1,2,4,8"
)
  throw new Error("Capacity receipt origin mismatch");
let comandos = 0;
for (const r of recibo.resultados) {
  comandos += r.comandos;
  if (
    r.comandos !== r.rodadas * r.simultaneos ||
    r.contadorRecuperado !== comandos ||
    r.diarioPersistido !== comandos ||
    r.horasMundo !== r.duracaoMs / 3_600_000 ||
    r.horasJogador !== (r.duracaoMs * r.simultaneos) / 3_600_000 ||
    r.latenciaRodadaMs.p50 > r.latenciaRodadaMs.p95 ||
    r.latenciaRodadaMs.p95 > r.latenciaRodadaMs.p99 ||
    r.latenciaRodadaMs.p99 > r.latenciaRodadaMs.max
  )
    throw new Error("Capacity evidence inconsistent");
}
const conexao = postgres(url.href, {
  max: 1,
  prepare: false,
  connection: { statement_timeout: 5000 },
});
try {
  const [r] = await conexao<
    { restantes: number }[]
  >`select count(*)::int as restantes from pg_database
    where datname ~ '^recreio_review_[a-f0-9]{32}$'`;
  if (r?.restantes !== 0) throw new Error("Disposable capacity database still present");
} finally {
  await conexao.end({ timeout: 5 });
}
await writeFile(
  path,
  `${JSON.stringify({ ...recibo, bancoDescartavelLimpo: true, conferidoEm: new Date().toISOString() }, null, 2)}\n`,
);
console.log(
  JSON.stringify({
    source: recibo.source,
    runId: recibo.runId,
    cenarios: 4,
    bancoDescartavelLimpo: true,
  }),
);
