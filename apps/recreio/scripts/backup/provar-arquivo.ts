import { createHash, randomBytes, randomUUID } from "node:crypto";
import { chmod, type FileHandle, mkdtemp, open, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { performance } from "node:perf_hooks";
import { criarCifradorDeArquivos, FalhaDoArquivoCifrado } from "./arquivo-cifrado";

const TAMANHO = 384 * 1024 * 1024,
  TETO_RSS = 192 * 1024 * 1024,
  BLOCO = 64 * 1024;
class FalhaDaProva extends Error {
  constructor(readonly codigo: string) {
    super(codigo);
  }
}
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
function exigir(sim: unknown, codigo: string): asserts sim {
  if (!sim) throw new FalhaDaProva(codigo);
}
const codigo = (e: unknown) =>
  e instanceof FalhaDaProva || e instanceof FalhaDoArquivoCifrado
    ? e.codigo
    : "PERFIL_INCONCLUSIVO";
async function gravarSintetico(h: FileHandle) {
  const bloco = randomBytes(BLOCO),
    hash = createHash("sha256");
  for (let pos = 0; pos < TAMANHO; pos += bloco.length) {
    let escrito = 0;
    while (escrito < bloco.length) {
      const r = await h.write(bloco, escrito, bloco.length - escrito, pos + escrito);
      exigir(r.bytesWritten > 0, "ESCRITA_INTERROMPIDA");
      escrito += r.bytesWritten;
    }
    hash.update(bloco);
  }
  bloco.fill(0);
  await h.sync();
  return hash.digest("hex");
}
async function resumoDoArquivo(h: FileHandle) {
  const bloco = Buffer.alloc(BLOCO),
    hash = createHash("sha256");
  let pos = 0;
  try {
    for (;;) {
      const { bytesRead } = await h.read(bloco, 0, bloco.length, pos);
      if (bytesRead === 0) return { bytes: pos, sha256: hash.digest("hex") };
      hash.update(bloco.subarray(0, bytesRead));
      pos += bytesRead;
    }
  } finally {
    bloco.fill(0);
  }
}
async function limpar(root: string, handles: FileHandle[]) {
  const fechamentos = await Promise.allSettled(handles.map((h) => h.close()));
  if (fechamentos.some((r) => r.status === "rejected"))
    throw new FalhaDaProva("HANDLE_NAO_FECHADO");
  if (!root) return;
  const alvo = await realpath(root),
    pai = await realpath(tmpdir());
  exigir(
    dirname(alvo) === pai && basename(alvo).startsWith("recreio-backup-arquivo-"),
    "LIMPEZA_FORA_DO_ESCOPO",
  );
  await rm(alvo, { recursive: true, force: true });
}
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
    const esperado = await gravarSintetico(origem);
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
      await limpar(root, handles);
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
