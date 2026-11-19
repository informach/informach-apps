import { createHash, randomBytes, randomUUID } from "node:crypto";
import { watch } from "node:fs";
import { link, mkdtemp, open, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { criarCifradorDeArquivos } from "../../../scripts/backup/arquivo-cifrado";

async function arquivos<T>(
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
const conteudo = Buffer.from("BACKUP_SINTETICO_NUNCA_PUBLICAR_CONTEUDO".repeat(2048));

describe("arquivo cifrado em handles reais: integridade e memória por blocos", () => {
  it.each(["chave", "ausente", "limite", "prazo"] as const)(
    "recusa configuração inválida de %s",
    (caso) => {
      const config = {
        chaveAtiva: "v1",
        chaves: new Map([["v1", randomBytes(32)]]),
        limiteBytes: 1024,
        tempoLimiteMs: 5000,
      };
      if (caso === "chave") config.chaves.set("v1", randomBytes(31));
      if (caso === "ausente") config.chaveAtiva = "v2";
      if (caso === "limite") config.limiteBytes = 0;
      if (caso === "prazo") config.tempoLimiteMs = 0;
      expect(() => criarCifradorDeArquivos(config)).toThrow("recreio.encrypted_file.CONFIGURACAO");
    },
  );
  it.each([Buffer.alloc(0), Buffer.from([0, 1, 255]), conteudo])(
    "recupera todos os bytes e mantém handles sob posse do chamador (%#)",
    async (bytes) =>
      arquivos(bytes, async (f) => {
        const ref = await f.codec.cifrar(f.origem, f.cifrado, f.contexto);
        expect(ref.bytes).toBe(bytes.length);
        expect(ref.sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
        expect((await f.cifrado.stat()).size).toBe(ref.bytesCifrados);
        const guardado = await readFile(join(f.root, "cifrado.bin"));
        expect(createHash("sha256").update(guardado).digest("hex")).toBe(ref.sha256Cifrado);
        if (bytes.length > 32) expect(guardado.includes(bytes.subarray(0, 32))).toBe(false);
        await f.codec.abrir(f.cifrado, f.aberto, ref);
        expect(await readFile(join(f.root, "aberto.bin"))).toEqual(bytes);
        expect((await f.origem.stat()).size).toBe(bytes.length);
        expect((await f.cifrado.stat()).size).toBe(ref.bytesCifrados);
      }),
  );
  it("o mesmo arquivo e captura geram IVs e ciphertexts distintos", async () =>
    arquivos(conteudo, async (f) => {
      const outro = await f.extra("segundo.bin");
      const a = await f.codec.cifrar(f.origem, f.cifrado, f.contexto),
        b = await f.codec.cifrar(f.origem, outro, f.contexto);
      expect(a.sha256).toBe(b.sha256);
      expect(a.sha256Cifrado).not.toBe(b.sha256Cifrado);
      await f.codec.abrir(outro, f.aberto, b);
      expect(await readFile(join(f.root, "aberto.bin"))).toEqual(conteudo);
    }));
  it.each(["magia", "payload", "tag"] as const)(
    "recusa adulteração de %s mesmo com SHA externo recalculado e limpa saída",
    async (caso) =>
      arquivos(conteudo, async (f) => {
        const ref = await f.codec.cifrar(f.origem, f.cifrado, f.contexto);
        const guardado = await readFile(join(f.root, "cifrado.bin"));
        const p =
          caso === "magia"
            ? 0
            : caso === "payload"
              ? Math.floor(guardado.length / 2)
              : guardado.length - 1;
        guardado[p] = (guardado[p] ?? 0) ^ 1;
        await f.cifrado.write(guardado, 0, guardado.length, 0);
        const alterada = {
          ...ref,
          sha256Cifrado: createHash("sha256").update(guardado).digest("hex"),
        };
        await expect(f.codec.abrir(f.cifrado, f.aberto, alterada)).rejects.toMatchObject({
          codigo: "INTEGRIDADE",
        });
        expect((await f.aberto.stat()).size).toBe(0);
        expect(await readFile(join(f.root, "origem.bin"))).toEqual(conteudo);
      }),
  );
  it("chave incorreta com mesmo ID descarta os bytes parciais depois da tag", async () =>
    arquivos(conteudo, async (f) => {
      const ref = await f.codec.cifrar(f.origem, f.cifrado, f.contexto);
      const errado = criarCifradorDeArquivos({
        chaveAtiva: "v1",
        chaves: new Map([["v1", randomBytes(32)]]),
        limiteBytes: 1024 * 1024,
        tempoLimiteMs: 5000,
      });
      await expect(errado.abrir(f.cifrado, f.aberto, ref)).rejects.toMatchObject({
        codigo: "INTEGRIDADE",
      });
      expect((await f.aberto.stat()).size).toBe(0);
    }));
  it.each(["contexto", "sha", "bytes", "truncado", "extra"] as const)(
    "recusa referência %s sem disponibilizar saída",
    async (caso) =>
      arquivos(conteudo, async (f) => {
        const ref = await f.codec.cifrar(f.origem, f.cifrado, f.contexto);
        let pedido: unknown = ref;
        if (caso === "contexto")
          pedido = { ...ref, contexto: { ...ref.contexto, id: randomUUID() } };
        if (caso === "sha") pedido = { ...ref, sha256: "0".repeat(64) };
        if (caso === "bytes") pedido = { ...ref, bytes: ref.bytes + 1 };
        if (caso === "extra") pedido = { ...ref, url: "https://invalid.example/private" };
        if (caso === "truncado") await f.cifrado.truncate(ref.bytesCifrados - 1);
        await expect(f.codec.abrir(f.cifrado, f.aberto, pedido)).rejects.toMatchObject({
          codigo: "INTEGRIDADE",
        });
        expect((await f.aberto.stat()).size).toBe(0);
      }),
  );
  it("rotação conserva leitura antiga e exige a chave da versão gravada", async () =>
    arquivos(conteudo, async (f) => {
      const ref = await f.codec.cifrar(f.origem, f.cifrado, f.contexto);
      const nova = randomBytes(32);
      const rotacionado = criarCifradorDeArquivos({
        chaveAtiva: "v2",
        chaves: new Map([
          ["v1", f.chave],
          ["v2", nova],
        ]),
        limiteBytes: 1024 * 1024,
        tempoLimiteMs: 5000,
      });
      await rotacionado.abrir(f.cifrado, f.aberto, ref);
      const outro = await f.extra("segundo.bin"),
        saida = await f.extra("saida-extra.bin");
      const atual = await rotacionado.cifrar(f.origem, outro, f.contexto);
      expect(atual.chaveId).toBe("v2");
      await expect(f.codec.abrir(outro, saida, atual)).rejects.toMatchObject({
        codigo: "CHAVE_INDISPONIVEL",
      });
      expect((await saida.stat()).size).toBe(0);
    }));
  it("copia a configuração e não aceita alteração posterior do mapa/chave", async () =>
    arquivos(conteudo, async (f) => {
      const chave = randomBytes(32),
        mapa = new Map([["v1", chave]]);
      const codec = criarCifradorDeArquivos({
        chaveAtiva: "v1",
        chaves: mapa,
        limiteBytes: 1024 * 1024,
        tempoLimiteMs: 5000,
      });
      chave.fill(0);
      mapa.clear();
      const ref = await codec.cifrar(f.origem, f.cifrado, f.contexto);
      await codec.abrir(f.cifrado, f.aberto, ref);
      expect(await readFile(join(f.root, "aberto.bin"))).toEqual(conteudo);
    }));
  it("não trunca destino preexistente nem origem usada como destino", async () =>
    arquivos(conteudo, async (f) => {
      const preservar = Buffer.from("NAO_APAGAR_ARQUIVO_PREEXISTENTE");
      await f.cifrado.writeFile(preservar);
      await expect(f.codec.cifrar(f.origem, f.cifrado, f.contexto)).rejects.toMatchObject({
        codigo: "LIMITE",
      });
      await expect(f.codec.cifrar(f.origem, f.origem, f.contexto)).rejects.toBeDefined();
      expect(await readFile(join(f.root, "cifrado.bin"))).toEqual(preservar);
      expect(await readFile(join(f.root, "origem.bin"))).toEqual(conteudo);
    }));
  it("limites são aplicados antes de carregar/cifrar e não truncam o destino", async () =>
    arquivos(conteudo, async (f) => {
      const codec = criarCifradorDeArquivos({
        chaveAtiva: "v1",
        chaves: new Map([["v1", f.chave]]),
        limiteBytes: 1,
        tempoLimiteMs: 5000,
      });
      await expect(codec.cifrar(f.origem, f.cifrado, f.contexto)).rejects.toMatchObject({
        codigo: "LIMITE",
      });
      expect((await f.cifrado.stat()).size).toBe(0);
    }));
  it("recusa origem com hardlink", async () =>
    arquivos(conteudo, async (f) => {
      await link(join(f.root, "origem.bin"), join(f.root, "alias.bin"));
      await expect(f.codec.cifrar(f.origem, f.cifrado, f.contexto)).rejects.toMatchObject({
        codigo: "CONFIGURACAO",
      });
      expect((await f.cifrado.stat()).size).toBe(0);
    }));
  it("cancelamento anterior à admissão não toca os arquivos", async () =>
    arquivos(conteudo, async (f) => {
      const controller = new AbortController();
      controller.abort();
      await expect(
        f.codec.cifrar(f.origem, f.cifrado, f.contexto, controller.signal),
      ).rejects.toMatchObject({ codigo: "INTERROMPIDO" });
      expect((await f.cifrado.stat()).size).toBe(0);
      expect(await readFile(join(f.root, "origem.bin"))).toEqual(conteudo);
    }));
  it(
    "alteração real da origem durante a escrita descarta o arquivo incompleto",
    async () =>
      arquivos(Buffer.alloc(32 * 1024 * 1024, 0x42), async (f) => {
        let alteracao: Promise<unknown> | undefined;
        const watcher = watch(join(f.root, "cifrado.bin"), () => {
          if (alteracao) return;
          alteracao = f.origem.write(Buffer.from([0x43]), 0, 1, 0);
        });
        try {
          await expect(f.codec.cifrar(f.origem, f.cifrado, f.contexto)).rejects.toMatchObject({
            codigo: "ARQUIVO_ALTERADO",
          });
          expect(alteracao).toBeDefined();
          await alteracao;
          expect((await f.cifrado.stat()).size).toBe(0);
        } finally {
          watcher.close();
          await alteracao;
        }
      }),
    30_000,
  );
  it("cancelamento depois da primeira escrita limpa a saída e preserva a origem", async () =>
    arquivos(Buffer.alloc(4 * 1024 * 1024, 0x42), async (f) => {
      const controller = new AbortController();
      const watcher = watch(join(f.root, "cifrado.bin"), () => controller.abort());
      try {
        await expect(
          f.codec.cifrar(f.origem, f.cifrado, f.contexto, controller.signal),
        ).rejects.toMatchObject({ codigo: "INTERROMPIDO" });
        expect((await f.cifrado.stat()).size).toBe(0);
        expect((await f.origem.stat()).size).toBe(4 * 1024 * 1024);
      } finally {
        watcher.close();
      }
    }));
});
