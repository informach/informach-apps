import { randomBytes, randomUUID } from "node:crypto";
import { chmod, type FileHandle, mkdtemp, open, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { criarCifradorDeArquivos, FalhaDoArquivoCifrado } from "./arquivo-cifrado";
import {
  exigir,
  FalhaDaProva,
  gravarSintetico,
  limparDiretorioDeProva,
  resumoDoArquivo,
} from "./provas-arquivos";

const TAMANHO = 384 * 1024 * 1024,
  TETO_RSS = 192 * 1024 * 1024;
type ReciboDoPerfil = {
  source: string;
  runId: string;
  boundary: string;
  status: "failed" | "passed";
  plainBytes: number;
  cipherBytes: number;
  rssLimitBytes: number;
  maxRssBytes: number;
  encryptMs: number;
  decryptMs: number;
  roundtripVerified: boolean;
  sourcePreserved: boolean;
  cleanupConfirmed: boolean;
  failure: string | null;
  cleanupFailure: string | null;
  productionDataTouched: false;
};
const codigo = (e: unknown) =>
  e instanceof FalhaDaProva || e instanceof FalhaDoArquivoCifrado
    ? e.codigo
    : "PERFIL_INCONCLUSIVO";
async function main() {
  const source = process.env.GITHUB_SHA,
    runId = process.env.GITHUB_RUN_ID;
  exigir(
    process.platform === "linux" &&
      process.argv.length === 2 &&
      process.env.CI === "true" &&
      process.env.GITHUB_ACTIONS === "true" &&
      process.env.GITHUB_REPOSITORY === "informach/informach-apps" &&
      runId &&
      /^\d+$/.test(runId) &&
      source &&
      /^[a-f0-9]{40}$/.test(source) &&
      process.env.RECREIO_FILE_RECEIPT_DIR === "/evidence",
    "EXECUTOR_FORA_DO_ESCOPO",
  );
  const recibo: ReciboDoPerfil = {
    source,
    runId,
    boundary: "synthetic_private_files_no_network_or_database",
    status: "failed",
    plainBytes: TAMANHO,
    cipherBytes: 0,
    rssLimitBytes: TETO_RSS,
    maxRssBytes: 0,
    encryptMs: 0,
    decryptMs: 0,
    roundtripVerified: false,
    sourcePreserved: false,
    cleanupConfirmed: false,
    failure: null,
    cleanupFailure: null,
    productionDataTouched: false,
  };
  let root = "";
  const handles: FileHandle[] = [];
  try {
    root = await mkdtemp(join(tmpdir(), "recreio-backup-arquivo-"));
    await chmod(root, 0o700);
    const arquivo = async (nome: "origem.bin" | "cifrado.bin" | "aberto.bin") => {
      const h = await open(join(root, nome), "wx+", 0o600);
      handles.push(h);
      return h;
    };
    const origem = await arquivo("origem.bin"),
      cifrado = await arquivo("cifrado.bin"),
      aberto = await arquivo("aberto.bin");
    const esperado = await gravarSintetico(origem, TAMANHO);
    const chave = randomBytes(32);
    const codec = criarCifradorDeArquivos({
      chaveAtiva: "prova-descartavel",
      chaves: new Map([["prova-descartavel", chave]]),
      limiteBytes: 512 * 1024 * 1024,
      tempoLimiteMs: 180_000,
    });
    chave.fill(0);
    const inicio = performance.now();
    const ref = await codec.cifrar(origem, cifrado, { tipo: "backup", id: randomUUID() });
    recibo.encryptMs = Math.round(performance.now() - inicio);
    recibo.cipherBytes = ref.bytesCifrados;
    exigir(ref.bytes === TAMANHO && ref.sha256 === esperado, "REFERENCIA_DIVERGENTE");
    const abrindo = performance.now();
    await codec.abrir(cifrado, aberto, ref);
    recibo.decryptMs = Math.round(performance.now() - abrindo);
    const voltou = await resumoDoArquivo(aberto);
    exigir(voltou.bytes === TAMANHO && voltou.sha256 === esperado, "ABERTURA_DIVERGENTE");
    recibo.roundtripVerified = true;
    const original = await resumoDoArquivo(origem);
    exigir(original.bytes === TAMANHO && original.sha256 === esperado, "ORIGEM_ALTERADA");
    recibo.sourcePreserved = true;
    recibo.maxRssBytes = process.resourceUsage().maxRSS * 1024;
    exigir(recibo.maxRssBytes <= TETO_RSS, "ORCAMENTO_DE_MEMORIA_EXCEDIDO");
    recibo.status = "passed";
  } catch (e) {
    recibo.failure = codigo(e);
  } finally {
    try {
      await limparDiretorioDeProva(root, handles, "recreio-backup-arquivo-");
      recibo.cleanupConfirmed = true;
    } catch (e) {
      recibo.cleanupFailure = codigo(e);
    }
  }
  if (!recibo.cleanupConfirmed) recibo.status = "failed";
  await writeFile(
    join("/evidence", "recreio-backup-arquivo.json"),
    `${JSON.stringify(recibo, null, 2)}\n`,
  );
  console.log(JSON.stringify(recibo));
  if (recibo.status !== "passed") process.exitCode = 1;
}
main().catch(() => {
  console.error("Perfil recusado ou inconclusivo; nenhum conteúdo de arquivo será exibido.");
  process.exitCode = 1;
});
