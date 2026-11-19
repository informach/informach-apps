import { describe, expect, it } from "vitest";
import { criarBucketS3DeTeste as fixture } from "../../../test/objetos-s3-apoio";

describe("objetos privados pelo SDK S3 real em HTTP fechado", () => {
  it("confirma escrita somente após reabrir, sem texto aberto na rede; replay 412 relê o mesmo objeto", async () => {
    const f = await fixture();
    try {
      expect(await f.storage.enviar(f.preparado)).toEqual(f.preparado.referencia);
      expect(f.objetos.size).toBe(1);
      expect(f.objetos.get(f.path)).toEqual(f.preparado.bytes);
      expect(f.objetos.get(f.path)?.includes(f.conteudo)).toBe(false);
      expect(await f.storage.enviar(f.preparado)).toEqual(f.preparado.referencia);
      expect(await f.storage.recuperar(f.preparado.referencia)).toEqual(f.conteudo);
      expect(f.pedidos.map((p) => p.metodo)).toEqual(["PUT", "GET", "PUT", "GET", "GET"]);
      expect(f.pedidos.every((p) => p.assinado)).toBe(true);
      expect(f.pedidos.filter((p) => p.metodo === "PUT").every((p) => p.condicao === "*")).toBe(
        true,
      );
    } finally {
      await f.fechar();
    }
  });
  it("resposta perdida permanece inconclusiva, não repete PUT e permite recuperação íntegra do recibo", async () => {
    const f = await fixture();
    try {
      f.estado.perderPut = true;
      await expect(f.storage.enviar(f.preparado)).rejects.toMatchObject({ codigo: "INCONCLUSIVO" });
      expect(f.pedidos.filter((p) => p.metodo === "PUT")).toHaveLength(1);
      expect(await f.storage.recuperar(f.preparado.referencia)).toEqual(f.conteudo);
    } finally {
      await f.fechar();
    }
  });
  it("cópia para captura conserva envelope autenticado sem devolver bytes abertos", async () => {
    const f = await fixture();
    try {
      f.objetos.set(f.path, f.preparado.bytes);
      const copia = await f.storage.recuperarEnvelope(f.preparado.referencia);
      expect(copia).toEqual(f.preparado.bytes);
      expect(copia).not.toBe(f.preparado.bytes);
      expect(copia.includes(f.conteudo)).toBe(false);
      expect(f.pedidos.map((p) => p.metodo)).toEqual(["GET"]);
    } finally {
      await f.fechar();
    }
  });
  it.each(["corromper", "parcial", "semTamanho"] as const)(
    "recusa leitura %s, inclusive depois de PUT confirmado",
    async (caso) => {
      const f = await fixture();
      try {
        f.estado[caso] = true;
        await expect(f.storage.enviar(f.preparado)).rejects.toMatchObject({
          codigo: "INTEGRIDADE",
        });
        await expect(f.storage.recuperar(f.preparado.referencia)).rejects.toMatchObject({
          codigo: "INTEGRIDADE",
        });
        await expect(f.storage.recuperarEnvelope(f.preparado.referencia)).rejects.toMatchObject({
          codigo: "INTEGRIDADE",
        });
        expect(f.objetos.size).toBe(1);
      } finally {
        await f.fechar();
      }
    },
  );
  it("não considera 412 confirmação de um objeto corrompido", async () => {
    const f = await fixture();
    try {
      f.objetos.set(f.path, Buffer.alloc(f.preparado.bytes.length));
      await expect(f.storage.enviar(f.preparado)).rejects.toMatchObject({ codigo: "INTEGRIDADE" });
      expect(f.pedidos.map((p) => p.metodo)).toEqual(["PUT", "GET"]);
    } finally {
      await f.fechar();
    }
  });
  it("ausência não cria outro objeto; referência não admite chave ou URL fornecida pelo cliente", async () => {
    const f = await fixture();
    try {
      await expect(f.storage.recuperar(f.preparado.referencia)).rejects.toMatchObject({
        codigo: "NAO_ENCONTRADO",
      });
      await expect(
        f.storage.recuperar({
          ...f.preparado.referencia,
          key: "outro",
          url: "https://example.test",
        }),
      ).rejects.toMatchObject({ codigo: "INTEGRIDADE" });
      expect(f.pedidos).toHaveLength(1);
      expect(f.objetos.size).toBe(0);
    } finally {
      await f.fechar();
    }
  });
  it("envelope alterado antes de enviar não sai para a rede", async () => {
    const f = await fixture();
    try {
      f.preparado.bytes[f.preparado.bytes.length - 1] = 0;
      // Alteração garantida, independente do valor aleatório da tag.
      f.preparado.bytes[0] = 0;
      await expect(f.storage.enviar(f.preparado)).rejects.toMatchObject({ codigo: "INTEGRIDADE" });
      expect(f.pedidos).toEqual([]);
    } finally {
      await f.fechar();
    }
  });
  it.each([0, 1025])(
    "referência com overhead impossível %i é recusada antes da rede",
    async (extra) => {
      const f = await fixture();
      try {
        await expect(
          f.storage.recuperar({
            ...f.preparado.referencia,
            bytesCifrados: f.preparado.referencia.bytes + extra,
          }),
        ).rejects.toMatchObject({ codigo: "INTEGRIDADE" });
        expect(f.pedidos).toEqual([]);
      } finally {
        await f.fechar();
      }
    },
  );
  it("recusa cliente com repetição automática habilitada", async () => {
    const f = await fixture(2000, 2);
    try {
      await expect(f.storage.recuperar(f.preparado.referencia)).rejects.toMatchObject({
        codigo: "CONFIGURACAO",
      });
      expect(f.pedidos).toEqual([]);
    } finally {
      await f.fechar();
    }
  });
  it("o prazo inclui corpo iniciado que parou de chegar e encerra o socket", async () => {
    const f = await fixture(500);
    try {
      f.objetos.set(f.path, f.preparado.bytes);
      f.estado.demorar = true;
      await expect(f.storage.recuperar(f.preparado.referencia)).rejects.toMatchObject({
        codigo: "INCONCLUSIVO",
      });
      expect(f.estado.leituraIniciada).toBe(true);
      expect(f.pedidos).toHaveLength(1);
    } finally {
      await f.fechar();
    }
  });
});
