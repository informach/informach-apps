import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, open, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { criarCifradorDeArquivos } from "../scripts/backup/arquivo-cifrado";

export async function comArquivosDeBackup<T>(
  bytes: Buffer,
  executar: (f: Awaited<ReturnType<typeof preparar>>) => Promise<T>,
) {
  const f = await preparar(bytes);
  const resultado = await Promise.resolve()
    .then(() => executar(f))
    .then(
      (valor): { sucesso: true; valor: T } => ({ sucesso: true, valor }),
      (erro: unknown): { sucesso: false; erro: unknown } => ({ sucesso: false, erro }),
    );
  try {
    await Promise.all(f.handles.map((h) => h.close()));
    const alvo = await realpath(f.root),
      pai = await realpath(tmpdir());
    if (dirname(alvo) !== pai || !basename(alvo).startsWith("recreio-arquivo-test-"))
      throw new Error("Unsafe test cleanup");
    await rm(alvo, { recursive: true, force: true });
  } catch (erro) {
    if (!resultado.sucesso)
      throw new AggregateError([resultado.erro, erro], "Test and cleanup failed");
    throw erro;
  }
  if (!resultado.sucesso) throw resultado.erro;
  return resultado.valor;
}
async function preparar(bytes: Buffer) {
  const root = await mkdtemp(join(tmpdir(), "recreio-arquivo-test-"));
  const origem = await open(join(root, "origem.bin"), "wx+", 0o600),
    cifrado = await open(join(root, "cifrado.bin"), "wx+", 0o600),
    aberto = await open(join(root, "aberto.bin"), "wx+", 0o600);
  await origem.writeFile(bytes);
  const handles = [origem, cifrado, aberto];
  const chave = randomBytes(32),
    contexto = { tipo: "backup", id: randomUUID() };
  const codec = criarCifradorDeArquivos({
    chaveAtiva: "v1",
    chaves: new Map([["v1", chave]]),
    limiteBytes: 64 * 1024 * 1024,
    tempoLimiteMs: 15_000,
  });
  const extra = async (nome: "segundo.bin" | "saida-extra.bin") => {
    const h = await open(join(root, nome), "wx+", 0o600);
    handles.push(h);
    return h;
  };
  return { root, origem, cifrado, aberto, handles, chave, contexto, codec, extra };
}

export type ArquivosDeBackup = Awaited<ReturnType<typeof preparar>>;
