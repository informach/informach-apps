import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { criarBucketS3DeTeste } from "../../../test/objetos-s3-apoio";
import { criarColetorDeObjetosS3 } from "./coleta-s3";

const limpezas: (() => Promise<void>)[] = [];
afterEach(async () => {
  while (limpezas.length) await limpezas.pop()?.();
});
async function fixture(tempo = 2000, maxAttempts = 1) {
  const b = await criarBucketS3DeTeste(tempo, maxAttempts);
  limpezas.push(b.fechar);
  const destino = {
      bucketId: randomUUID(),
      bucketName: "recreio-fixture",
      escopo: "qualification" as const,
    },
    mundoId = randomUUID(),
    cipherSha256 = "b".repeat(64),
    t = {
      id: randomUUID(),
      token: randomUUID(),
      mundoId,
      destino,
      cipherSha256,
      objectKey: `recreio/v1/fotografia/${mundoId}/${cipherSha256}`,
    },
    path = `/recreio-fixture/${t.objectKey}`,
    transporte = criarColetorDeObjetosS3({ cliente: b.cliente, destino, tempoLimiteMs: tempo });
  return { ...b, t, path, transporte };
}
describe("coleta S3 com SDK real e HTTP fechado", () => {
  it("nega prefixo/recibo/destino divergentes antes da rede", async () => {
    const f = await fixture();
    for (const t of [
      { ...f.t, objectKey: "../fora" },
      { ...f.t, mundoId: randomUUID() },
      { ...f.t, destino: { ...f.t.destino, bucketId: randomUUID() } },
    ])
      await expect(f.transporte.retirar(t)).rejects.toMatchObject({ codigo: "CONFIGURACAO" });
    expect(f.pedidos).toHaveLength(0);
  });
  it("ausência prévia exige NoSuchKey e não emite DELETE", async () => {
    const f = await fixture();
    expect(await f.transporte.retirar(f.t)).toEqual({ objetoEncontrado: false });
    expect(f.pedidos.map((v) => v.metodo)).toEqual(["GET"]);
  });
  it("retira só chave canônica, confirma GET e preserva outro objeto", async () => {
    const f = await fixture();
    f.objetos.set(f.path, Buffer.alloc(1024 * 1024, 7));
    f.objetos.set(`${f.path}-vizinho`, Buffer.from("preservar"));
    expect(await f.transporte.retirar(f.t)).toEqual({ objetoEncontrado: true });
    expect(f.pedidos.map((v) => v.metodo)).toEqual(["GET", "DELETE", "GET"]);
    expect(f.pedidos.every((v) => v.assinado && v.url.split("?")[0] === f.path)).toBe(true);
    expect(f.objetos.has(f.path)).toBe(false);
    expect(f.objetos.has(`${f.path}-vizinho`)).toBe(true);
    expect(await f.transporte.retirar(f.t)).toEqual({ objetoEncontrado: false });
  });
  it("resposta de DELETE perdida só é conciliada pelo GET de ausência", async () => {
    const f = await fixture();
    f.objetos.set(f.path, Buffer.from("sintetico"));
    f.estado.perderDelete = true;
    expect(await f.transporte.retirar(f.t)).toEqual({ objetoEncontrado: true });
    expect(f.pedidos.map((v) => v.metodo)).toEqual(["GET", "DELETE", "GET"]);
  });
  it("sucesso de DELETE sem ausência mantém operação inconclusiva", async () => {
    const f = await fixture();
    f.objetos.set(f.path, Buffer.from("sintetico"));
    f.estado.preservarDelete = true;
    await expect(f.transporte.retirar(f.t)).rejects.toMatchObject({ codigo: "INCONCLUSIVO" });
    expect(f.objetos.has(f.path)).toBe(true);
  });
  it.each(["negar", "bucketAusente"] as const)("%s não é ausência", async (modo) => {
    const f = await fixture();
    f.estado[modo] = true;
    await expect(f.transporte.retirar(f.t)).rejects.toMatchObject({ codigo: "CONFIGURACAO" });
    expect(f.pedidos.map((v) => v.metodo)).toEqual(["GET"]);
  });
  it("prazo de rede encerrado não autoriza DELETE nem afirma ausência", async () => {
    const f = await fixture(50);
    f.estado.silenciar = true;
    await expect(f.transporte.retirar(f.t)).rejects.toMatchObject({ codigo: "INCONCLUSIVO" });
    expect(f.pedidos.every((v) => v.metodo === "GET")).toBe(true);
  });
  it("repetição automática do SDK é recusada antes da rede", async () => {
    const f = await fixture(2000, 2);
    await expect(f.transporte.retirar(f.t)).rejects.toMatchObject({ codigo: "CONFIGURACAO" });
    expect(f.pedidos).toHaveLength(0);
  });
});
