import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  criarCifradorDeArquivos,
  type ReferenciaDoArquivoCifrado,
} from "../../../scripts/backup/arquivo-cifrado";
import { criarTransporteDeArquivosS3 } from "../../../scripts/backup/arquivo-s3";
import { type ArquivosDeBackup, comArquivosDeBackup } from "../../../test/arquivo-apoio";
import { criarBucketS3DeTeste } from "../../../test/objetos-s3-apoio";

const texto = Buffer.from("ARQUIVO_PRIVADO_SINTETICO".repeat(16384));
type Cenario = ArquivosDeBackup & {
  rede: Awaited<ReturnType<typeof criarBucketS3DeTeste>>;
  ref: ReferenciaDoArquivoCifrado;
  transporte: ReturnType<typeof criarTransporteDeArquivosS3>;
  path: string;
};
async function cenario(
  executar: (f: Cenario) => Promise<void>,
  opcoes: { tempoLimiteMs?: number; maxAttempts?: number } = {},
) {
  await comArquivosDeBackup(texto, async (f) => {
    const rede = await criarBucketS3DeTeste(2000, opcoes.maxAttempts ?? 1);
    try {
      const ref = await f.codec.cifrar(f.origem, f.cifrado, f.contexto);
      const transporte = criarTransporteDeArquivosS3({
        cliente: rede.cliente,
        bucket: rede.storage.bucketName,
        cifrador: f.codec,
        limiteBytesCifrados: 2 * 1024 * 1024,
        tempoLimiteMs: opcoes.tempoLimiteMs ?? 3000,
      });
      const path = `/${rede.storage.bucketName}/recreio/v1/backup/${ref.contexto.id}/${ref.sha256Cifrado}`;
      await executar({ ...f, rede, ref, transporte, path });
    } finally {
      await rede.fechar();
    }
  });
}

describe("arquivo privado: FileHandle/SDK/HTTP reais, readback sem dump aberto", () => {
  it("transfere todos os blocos cifrados, confere após leitura e não fecha handles emprestados", async () =>
    cenario(async (f) => {
      expect(await f.transporte.enviar(f.ref, f.cifrado, f.aberto)).toEqual(f.ref);
      const bytes = await readFile(join(f.root, "cifrado.bin"));
      expect(f.rede.objetos.get(f.path)).toEqual(bytes);
      expect(bytes.includes(texto.subarray(0, 64))).toBe(false);
      expect(await readFile(join(f.root, "aberto.bin"))).toEqual(bytes);
      const plain = await f.extra("saida-extra.bin");
      await f.codec.abrir(f.aberto, plain, f.ref);
      expect(await readFile(join(f.root, "saida-extra.bin"))).toEqual(texto);
      const outro = await f.extra("segundo.bin");
      expect(await f.transporte.recuperar(f.ref, outro)).toEqual(f.ref);
      expect((await f.cifrado.stat()).size).toBe(f.ref.bytesCifrados);
      expect((await f.aberto.stat()).size).toBe(f.ref.bytesCifrados);
      expect(f.rede.pedidos.map((p) => p.metodo)).toEqual(["PUT", "GET", "GET"]);
      expect(f.rede.pedidos.every((p) => p.assinado)).toBe(true);
      expect(f.rede.pedidos[0]?.condicao).toBe("*");
    }));
  it("replay 412 relê o mesmo arquivo sem trocar objeto", async () =>
    cenario(async (f) => {
      await f.transporte.enviar(f.ref, f.cifrado, f.aberto);
      const outro = await f.extra("segundo.bin");
      await f.transporte.enviar(f.ref, f.cifrado, outro);
      expect(f.rede.objetos.size).toBe(1);
      expect(await readFile(join(f.root, "segundo.bin"))).toEqual(
        await readFile(join(f.root, "aberto.bin")),
      );
      expect(f.rede.pedidos.map((p) => p.metodo)).toEqual(["PUT", "GET", "PUT", "GET"]);
    }));
  it("PUT com resposta perdida não repete e recupera sem a cópia cifrada local", async () =>
    cenario(async (f) => {
      f.rede.estado.perderPut = true;
      await expect(f.transporte.enviar(f.ref, f.cifrado, f.aberto)).rejects.toMatchObject({
        codigo: "INCONCLUSIVO",
      });
      expect(f.rede.pedidos.map((p) => p.metodo)).toEqual(["PUT"]);
      expect((await f.aberto.stat()).size).toBe(0);
      await f.cifrado.truncate(0);
      await f.transporte.recuperar(f.ref, f.aberto);
      const plain = await f.extra("saida-extra.bin");
      await f.codec.abrir(f.aberto, plain, f.ref);
      expect(await readFile(join(f.root, "saida-extra.bin"))).toEqual(texto);
      expect(f.rede.objetos.size).toBe(1);
      expect(f.rede.pedidos.map((p) => p.metodo)).toEqual(["PUT", "GET"]);
    }));
  it.each(["corromper", "parcial", "semTamanho"] as const)(
    "recusa readback %s, limpa o estágio e conserva o original",
    async (caso) =>
      cenario(async (f) => {
        f.rede.estado[caso] = true;
        await expect(f.transporte.enviar(f.ref, f.cifrado, f.aberto)).rejects.toMatchObject({
          codigo: "INTEGRIDADE",
        });
        expect((await f.aberto.stat()).size).toBe(0);
        expect((await f.cifrado.stat()).size).toBe(f.ref.bytesCifrados);
        expect(await readFile(join(f.root, "origem.bin"))).toEqual(texto);
      }),
  );
  it("412 com corpo divergente não confirma presença como integridade", async () =>
    cenario(async (f) => {
      f.rede.objetos.set(f.path, Buffer.alloc(f.ref.bytesCifrados));
      await expect(f.transporte.enviar(f.ref, f.cifrado, f.aberto)).rejects.toMatchObject({
        codigo: "INTEGRIDADE",
      });
      expect((await f.aberto.stat()).size).toBe(0);
      expect(f.rede.pedidos.map((p) => p.metodo)).toEqual(["PUT", "GET"]);
    }));
  it("objeto ausente responde como ausente, sem inventar outro arquivo", async () =>
    cenario(async (f) => {
      await expect(f.transporte.recuperar(f.ref, f.aberto)).rejects.toMatchObject({
        codigo: "NAO_ENCONTRADO",
      });
      expect((await f.aberto.stat()).size).toBe(0);
      expect(f.rede.pedidos.map((p) => p.metodo)).toEqual(["GET"]);
    }));
  it("recusa origem adulterada antes do upload", async () =>
    cenario(async (f) => {
      await f.cifrado.write(Buffer.from([0]), 0, 1, 0);
      await expect(f.transporte.enviar(f.ref, f.cifrado, f.aberto)).rejects.toMatchObject({
        codigo: "INTEGRIDADE",
      });
      expect(f.rede.pedidos).toEqual([]);
      expect((await f.aberto.stat()).size).toBe(0);
    }));
  it("não sobrescreve saída preexistente nem aceita a origem como readback", async () =>
    cenario(async (f) => {
      const preservar = Buffer.from("ARQUIVO_PREEXISTENTE");
      await f.aberto.writeFile(preservar);
      await expect(f.transporte.enviar(f.ref, f.cifrado, f.aberto)).rejects.toMatchObject({
        codigo: "CONFIGURACAO",
      });
      await expect(f.transporte.recuperar(f.ref, f.aberto)).rejects.toMatchObject({
        codigo: "CONFIGURACAO",
      });
      await expect(f.transporte.enviar(f.ref, f.cifrado, f.cifrado)).rejects.toMatchObject({
        codigo: "CONFIGURACAO",
      });
      expect(await readFile(join(f.root, "aberto.bin"))).toEqual(preservar);
      expect(f.rede.pedidos).toEqual([]);
    }));
  it("recusa limite e chave ausente antes de GET/PUT", async () =>
    cenario(async (f) => {
      const pequeno = criarTransporteDeArquivosS3({
        cliente: f.rede.cliente,
        bucket: f.rede.storage.bucketName,
        cifrador: f.codec,
        limiteBytesCifrados: 1,
        tempoLimiteMs: 2000,
      });
      await expect(pequeno.recuperar(f.ref, f.aberto)).rejects.toMatchObject({ codigo: "LIMITE" });
      const novo = criarCifradorDeArquivos({
        chaveAtiva: "nova",
        chaves: new Map([["nova", randomBytes(32)]]),
        limiteBytes: 2 * 1024 * 1024,
        tempoLimiteMs: 2000,
      });
      const semChave = criarTransporteDeArquivosS3({
        cliente: f.rede.cliente,
        bucket: f.rede.storage.bucketName,
        cifrador: novo,
        limiteBytesCifrados: 2 * 1024 * 1024,
        tempoLimiteMs: 2000,
      });
      await expect(semChave.recuperar(f.ref, f.aberto)).rejects.toMatchObject({
        codigo: "CHAVE_INDISPONIVEL",
      });
      expect(f.rede.pedidos).toEqual([]);
    }));
  it("cliente com repetição automática é recusado antes de rede", async () =>
    cenario(
      async (f) => {
        await expect(f.transporte.recuperar(f.ref, f.aberto)).rejects.toMatchObject({
          codigo: "CONFIGURACAO",
        });
        expect(f.rede.pedidos).toEqual([]);
      },
      { maxAttempts: 2 },
    ));
  it("prazo cobre corpo lento e limpa o estágio parcial sem fechar o handle", async () =>
    cenario(
      async (f) => {
        await f.transporte.enviar(f.ref, f.cifrado, f.aberto);
        const destino = await f.extra("segundo.bin");
        f.rede.estado.demorar = true;
        f.rede.estado.leituraIniciada = false;
        await expect(f.transporte.recuperar(f.ref, destino)).rejects.toMatchObject({
          codigo: "INCONCLUSIVO",
        });
        expect(f.rede.estado.leituraIniciada).toBe(true);
        expect((await destino.stat()).size).toBe(0);
        expect((await f.cifrado.stat()).size).toBe(f.ref.bytesCifrados);
      },
      { tempoLimiteMs: 1000 },
    ));
});
