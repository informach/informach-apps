import { randomBytes, randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { criarIndiceDeRecuperacao } from "../../../scripts/backup/indice-recuperacao";
import { criarArmazenamentoDoIndiceS3 } from "../../../scripts/backup/indice-s3";
import { criarBucketS3DeTeste } from "../../../test/objetos-s3-apoio";

const limpezas: (() => Promise<void>)[] = [];
afterEach(async () => {
  while (limpezas.length) await limpezas.pop()?.();
});

async function fixture(tempoLimiteMs = 2000, maxAttempts = 1) {
  const bucket = await criarBucketS3DeTeste(tempoLimiteMs, maxAttempts);
  limpezas.push(bucket.fechar);
  const id = randomUUID(),
    destino = {
      bucketId: randomUUID(),
      bucketName: "recreio-fixture",
      escopo: "qualification" as const,
    },
    indice = criarIndiceDeRecuperacao({
      destino,
      chaveAtiva: "v1",
      chaves: new Map([["v1", randomBytes(32)]]),
    });
  limpezas.push(async () => indice.encerrar());
  const publicacao = {
    tipo: "publicado",
    capturaId: id,
    destino,
    source: "b".repeat(40),
    iniciadaEm: "2026-11-19T00:00:00.000Z",
    conferidaEm: "2026-11-19T00:01:00.000Z",
    arquivo: {
      formato: "recreio-arquivo-cifrado-v1",
      chaveId: "v1",
      contexto: { tipo: "backup", id },
      bytes: 1234,
      sha256: "a".repeat(64),
      sha256Cifrado: "b".repeat(64),
      bytesCifrados: 1414,
    },
    composto: {
      formato: "recreio-captura-composta-v1",
      capturaId: id,
      bytes: 1234,
      sha256: "a".repeat(64),
    },
    inventario: { quantidade: 2, bytesCifrados: 400, sha256: "c".repeat(64) },
  };
  const retirada = {
    tipo: "retirado",
    capturaId: id,
    destino,
    source: publicacao.source,
    registradaEm: "2026-11-19T00:02:00.000Z",
    arquivoSha256Cifrado: publicacao.arquivo.sha256Cifrado,
    motivo: "retencao",
  };
  const storage = criarArmazenamentoDoIndiceS3({
    cliente: bucket.cliente,
    bucket: destino.bucketName,
    indice,
    tempoLimiteMs,
  });
  const bytes = indice.assinar(publicacao),
    tombstone = indice.assinar(retirada),
    path = `/recreio-fixture/recreio/v1/backup/${id}/manifesto.json`,
    tombPath = `/recreio-fixture/recreio/v1/backup/${id}/retirado.json`;
  function guardar(p: string, b: Buffer) {
    bucket.objetos.set(p, b);
    bucket.tipos.set(p, "application/json");
  }
  return {
    ...bucket,
    id,
    indice,
    publicacao,
    retirada,
    storage,
    bytes,
    tombstone,
    path,
    tombPath,
    guardar,
  };
}

describe("índice de recuperação pelo SDK S3 e HTTP real", () => {
  it("publica condicionalmente, relê, repete pelo 412 e recupera sem banco", async () => {
    const f = await fixture();
    expect(await f.storage.publicar(f.bytes, f.id)).toEqual(f.publicacao);
    expect(f.objetos.get(f.path)).toEqual(f.bytes);
    expect(f.tipos.get(f.path)).toBe("application/json");
    expect(await f.storage.publicar(f.bytes, f.id)).toEqual(f.publicacao);
    expect(await f.storage.recuperar(f.id)).toEqual({ publicacao: f.publicacao, bytes: f.bytes });
    expect(f.pedidos.every((p) => p.assinado)).toBe(true);
    const puts = f.pedidos.filter((p) => p.metodo === "PUT");
    expect(puts).toHaveLength(2);
    expect(puts.every((p) => p.condicao === "*")).toBe(true);
    expect(f.objetos.size).toBe(1);
  });
  it("resposta perdida não repete PUT e permite recuperação do original", async () => {
    const f = await fixture();
    f.estado.perderPut = true;
    await expect(f.storage.publicar(f.bytes, f.id)).rejects.toMatchObject({
      codigo: "INCONCLUSIVO",
    });
    expect(f.objetos.get(f.path)).toEqual(f.bytes);
    f.estado.perderPut = false;
    expect((await f.storage.recuperar(f.id)).bytes).toEqual(f.bytes);
    expect(f.pedidos.filter((p) => p.metodo === "PUT")).toHaveLength(1);
  });
  it("retirada anterior impede qualquer publicação", async () => {
    const f = await fixture();
    expect(await f.storage.registrarRetirada(f.tombstone, f.id)).toEqual(f.retirada);
    await expect(f.storage.publicar(f.bytes, f.id)).rejects.toMatchObject({ codigo: "RETIRADO" });
    expect(f.objetos.has(f.path)).toBe(false);
    expect(f.pedidos.filter((p) => p.metodo === "PUT")).toHaveLength(1);
    await f.storage.registrarRetirada(f.tombstone, f.id);
    expect(f.objetos.size).toBe(1);
  });
  it("retirada e publicação concorrentes nunca permitem recuperar publicação retirada", async () => {
    const f = await fixture();
    const resultados = await Promise.allSettled([
      f.storage.publicar(f.bytes, f.id),
      f.storage.registrarRetirada(f.tombstone, f.id),
    ]);
    expect(resultados[1]?.status).toBe("fulfilled");
    const publicada = resultados[0];
    if (publicada?.status === "rejected")
      expect(publicada.reason).toMatchObject({ codigo: "RETIRADO" });
    if (!f.objetos.has(f.path)) f.guardar(f.path, f.bytes); // PUT tardio após a retirada.
    await expect(f.storage.recuperar(f.id)).rejects.toMatchObject({ codigo: "RETIRADO" });
  });
  it("412 com outro índice válido não autoriza substituir bytes já preparados", async () => {
    const f = await fixture(),
      outro = f.indice.assinar({ ...f.publicacao, conferidaEm: "2026-11-19T00:03:00.000Z" });
    f.guardar(f.path, outro);
    await expect(f.storage.publicar(f.bytes, f.id)).rejects.toMatchObject({
      codigo: "INTEGRIDADE",
    });
    expect(f.objetos.get(f.path)).toEqual(outro);
  });
  it.each(["negar", "bucketAusente"] as const)(
    "%s não equivale a retirada ausente",
    async (flag) => {
      const f = await fixture();
      f.estado[flag] = true;
      await expect(f.storage.publicar(f.bytes, f.id)).rejects.toMatchObject({
        codigo: "CONFIGURACAO",
      });
      expect(f.pedidos.some((p) => p.metodo === "PUT")).toBe(false);
    },
  );
  it("NoSuchKey na recuperação é ausência explícita, sem criar objetos", async () => {
    const f = await fixture();
    await expect(f.storage.recuperar(f.id)).rejects.toMatchObject({ codigo: "NAO_ENCONTRADO" });
    expect(f.objetos.size).toBe(0);
  });
  it.each(["corromper", "parcial", "semTamanho"] as const)(
    "leitura %s não é aceita",
    async (flag) => {
      const f = await fixture();
      f.guardar(f.path, f.bytes);
      f.estado[flag] = true;
      await expect(f.storage.recuperar(f.id)).rejects.toMatchObject({ codigo: "INTEGRIDADE" });
    },
  );
  it("tipo de conteúdo inesperado é recusado", async () => {
    const f = await fixture();
    f.guardar(f.path, f.bytes);
    f.tipos.set(f.path, "text/html");
    await expect(f.storage.recuperar(f.id)).rejects.toMatchObject({ codigo: "INTEGRIDADE" });
  });
  it("prazo aborta corpo HTTP já iniciado", async () => {
    const f = await fixture(500);
    f.guardar(f.path, f.bytes);
    f.estado.demorar = true;
    await expect(f.storage.recuperar(f.id)).rejects.toMatchObject({ codigo: "INCONCLUSIVO" });
    expect(f.estado.leituraIniciada).toBe(true);
  });
  it("retirada contraditória falha fechada", async () => {
    const f = await fixture();
    f.guardar(f.path, f.bytes);
    f.guardar(
      f.tombPath,
      f.indice.assinar({ ...f.retirada, arquivoSha256Cifrado: "d".repeat(64) }),
    );
    await expect(f.storage.recuperar(f.id)).rejects.toMatchObject({ codigo: "INTEGRIDADE" });
  });
  it("política de repetição automática incompatível é recusada antes da rede", async () => {
    const f = await fixture(2000, 2);
    await expect(f.storage.publicar(f.bytes, f.id)).rejects.toMatchObject({
      codigo: "CONFIGURACAO",
    });
    expect(f.pedidos).toHaveLength(0);
  });
  it("UUID inválido, bytes alterados e cancelamento prévio não fazem pedidos", async () => {
    const f = await fixture(),
      cancelado = new AbortController();
    cancelado.abort();
    await expect(f.storage.recuperar("../outra-chave")).rejects.toMatchObject({
      codigo: "CONFIGURACAO",
    });
    const corrompido = Buffer.from(f.bytes);
    corrompido[0] = 0;
    await expect(f.storage.publicar(corrompido, f.id)).rejects.toMatchObject({
      codigo: "INTEGRIDADE",
    });
    await expect(f.storage.publicar(f.bytes, f.id, cancelado.signal)).rejects.toMatchObject({
      codigo: "INCONCLUSIVO",
    });
    expect(f.pedidos).toHaveLength(0);
  });
});
