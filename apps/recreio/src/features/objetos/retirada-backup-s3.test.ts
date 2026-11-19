import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { criarIndiceDeRecuperacao } from "../../../scripts/backup/indice-recuperacao";
import { criarRetiradaDoBackupS3 } from "../../../scripts/backup/retirada-s3";
import { criarBucketS3DeTeste } from "../../../test/objetos-s3-apoio";

const limpezas: (() => Promise<void>)[] = [];
afterEach(async () => {
  while (limpezas.length) await limpezas.pop()?.();
});
async function fixture() {
  const b = await criarBucketS3DeTeste();
  limpezas.push(b.fechar);
  const destino = {
      bucketId: randomUUID(),
      bucketName: "recreio-fixture",
      escopo: "qualification" as const,
    },
    id = randomUUID(),
    indice = criarIndiceDeRecuperacao({
      destino,
      chaveAtiva: "v1",
      chaves: new Map([["v1", Buffer.alloc(32, 7)]]),
    });
  limpezas.push(async () => indice.encerrar());
  const marcador = {
      tipo: "retirado" as const,
      capturaId: id,
      destino,
      source: "c".repeat(40),
      registradaEm: "2026-11-19T00:00:00.000Z",
      arquivoSha256Cifrado: "b".repeat(64),
      motivo: "retencao" as const,
    },
    bytes = indice.assinar(marcador),
    path = `/recreio-fixture/recreio/v1/backup/${id}/${marcador.arquivoSha256Cifrado}`,
    transporte = criarRetiradaDoBackupS3({
      cliente: b.cliente,
      destino,
      indice,
      tempoLimiteMs: 2000,
    });
  return { ...b, destino, id, indice, marcador, bytes, path, transporte };
}
describe("payload de backup: retirada limitada à referência assinada", () => {
  it("só retira folha do arquivo; conserva manifesto, tombstone e vizinho", async () => {
    const f = await fixture(),
      base = `/recreio-fixture/recreio/v1/backup/${f.id}/`;
    for (const p of [f.path, `${base}manifesto.json`, `${base}retirado.json`, `${f.path}-vizinho`])
      f.objetos.set(p, Buffer.from("sintetico"));
    expect(await f.transporte.retirar(f.id, f.bytes)).toEqual({ objetoEncontrado: true });
    expect(f.objetos.has(f.path)).toBe(false);
    for (const p of [`${base}manifesto.json`, `${base}retirado.json`, `${f.path}-vizinho`])
      expect(f.objetos.has(p)).toBe(true);
    expect(f.pedidos.every((p) => p.url.split("?")[0] === f.path && p.assinado)).toBe(true);
  });
  it("marcador adulterado ou de outra captura não inicia rede", async () => {
    const f = await fixture(),
      ruim = Buffer.from(f.bytes);
    ruim[ruim.length - 2] = 0;
    await expect(f.transporte.retirar(f.id, ruim)).rejects.toMatchObject({ codigo: "INTEGRIDADE" });
    await expect(f.transporte.retirar(randomUUID(), f.bytes)).rejects.toMatchObject({
      codigo: "INTEGRIDADE",
    });
    expect(f.pedidos).toHaveLength(0);
  });
  it("índice de publicação não substitui retirada assinada", async () => {
    const f = await fixture(),
      publicacao = f.indice.assinar({
        tipo: "publicado",
        capturaId: f.id,
        destino: f.destino,
        source: f.marcador.source,
        iniciadaEm: f.marcador.registradaEm,
        conferidaEm: f.marcador.registradaEm,
        arquivo: {
          formato: "recreio-arquivo-cifrado-v1",
          chaveId: "v1",
          contexto: { tipo: "backup", id: f.id },
          bytes: 10,
          sha256: "a".repeat(64),
          sha256Cifrado: "b".repeat(64),
          bytesCifrados: 110,
        },
        composto: {
          formato: "recreio-captura-composta-v1",
          capturaId: f.id,
          bytes: 10,
          sha256: "a".repeat(64),
        },
        inventario: { quantidade: 0, bytesCifrados: 0, sha256: "a".repeat(64) },
      });
    await expect(f.transporte.retirar(f.id, publicacao)).rejects.toMatchObject({
      codigo: "CONFIGURACAO",
    });
    expect(f.pedidos).toHaveLength(0);
  });
  it("ausência de chave antiga recusa DELETE sem assinar outro marcador", async () => {
    const f = await fixture(),
      novo = criarIndiceDeRecuperacao({
        destino: f.destino,
        chaveAtiva: "v2",
        chaves: new Map([["v2", Buffer.alloc(32, 8)]]),
      });
    limpezas.push(async () => novo.encerrar());
    const transporte = criarRetiradaDoBackupS3({
      cliente: f.cliente,
      destino: f.destino,
      indice: novo,
      tempoLimiteMs: 2000,
    });
    await expect(transporte.retirar(f.id, f.bytes)).rejects.toMatchObject({
      codigo: "CHAVE_INDISPONIVEL",
    });
    expect(f.pedidos).toHaveLength(0);
  });
});
