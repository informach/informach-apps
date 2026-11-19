import { db, eq } from "@informach/db";
import { recreioGroups as groups } from "@informach/db/schema";
import { describe, expect, it } from "vitest";
import { AceiteDaCompraSchema } from "@/features/cobranca/regras";
import { prepararCompraNoBanco } from "@/features/cobranca/repository";
import {
  consultarMinhaCompra,
  encerrarCompraNaoEnviada,
  prepararMinhaCompra,
} from "@/features/cobranca/service";
import { pedidoDaCompra } from "./compra-apoio";
import { adultoDoTeste } from "./teste-apoio";

describe("cobrança desligada", () => {
  it("recusa nova preparação antes de criar grupo", async () => {
    const p = await adultoDoTeste();
    await expect(prepararMinhaCompra(p.autor, pedidoDaCompra())).rejects.toMatchObject({
      code: "INDISPONIVEL",
    });
    expect(await db.select().from(groups).where(eq(groups.ownerUserId, p.conta.id))).toEqual([]);
  });
  it("permite ler e encerrar autorização anterior sem ativar compra", async () => {
    const p = await adultoDoTeste();
    // Prepara o registro antigo pelo repository nativo real, representando o corte do modo.
    const anterior = await prepararCompraNoBanco(
      p.autor,
      AceiteDaCompraSchema.parse(pedidoDaCompra()),
      "dev",
    );
    expect(await consultarMinhaCompra(p.autor)).toEqual(anterior);
    const encerrado = await encerrarCompraNaoEnviada(p.autor, anterior.id);
    expect(encerrado.resolucao).toBe("not_started");
    expect(await encerrarCompraNaoEnviada(p.autor, anterior.id)).toEqual(encerrado);
    await expect(prepararMinhaCompra(p.autor, pedidoDaCompra())).rejects.toMatchObject({
      code: "INDISPONIVEL",
    });
  });
});
