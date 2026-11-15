import "server-only";
import { gunzipSync, gzipSync } from "node:zlib";
import { jogoPorId } from "@informach/config/jogos";
import {
  abrirFotografia,
  conferirMetadadosDaFotografia,
  type Fato,
  restaurar,
  VERSAO_DO_MUNDO,
} from "@informach/morada-sim";
import { MundoIdSchema } from "@informach/recreio";
import { z } from "zod";
import {
  aplicarRecuperacao,
  type PedidoDeRecuperacao,
  prepararRecuperacao,
  RecusaDeRecuperacao,
  reciboDeRecuperacao,
} from "../src/features/recuperacao/repository";

export const PedidoDeRestauracaoDoMoradaSchema = z.strictObject({
  mundoId: MundoIdSchema,
  revisaoFonte: z.number().int().nonnegative(),
  revisaoEsperada: z.number().int().nonnegative(),
  operacaoId: z.uuid(),
  motivo: z.string().regex(/^[a-z0-9_]{2,40}$/),
});

function pedidoDoMorada(entrada: unknown): PedidoDeRecuperacao {
  const dados = PedidoDeRestauracaoDoMoradaSchema.parse(entrada);
  const manifesto = jogoPorId("morada");
  if (!manifesto) throw new RecusaDeRecuperacao("NAO_ENCONTRADO");
  return {
    ...dados,
    jogo: manifesto.id,
    fotografiaMaxBytes: manifesto.limites.fotografiaMaxBytes,
    diarioPendenteMaxBytes: manifesto.limites.diarioPendenteMaxBytes,
  };
}

/** Adapter operacional específico: o armazenamento/API das instâncias continua opaco. */
export async function prepararRestauracaoDoMorada(entrada: unknown) {
  const pedido = pedidoDoMorada(entrada);
  const material = await prepararRecuperacao(pedido);
  try {
    if (material.mundo.schemaVersion > VERSAO_DO_MUNDO)
      throw new RecusaDeRecuperacao("INTEGRIDADE");
    const leitura = new TextDecoder("utf-8", { fatal: true });
    const documento = JSON.parse(
      leitura.decode(gunzipSync(material.foto.bytes, { maxOutputLength: 64 * 1024 * 1024 })),
    );
    if (
      !conferirMetadadosDaFotografia(documento, {
        mundoId: pedido.mundoId,
        tick: material.foto.tick,
        versaoDoMundo: material.foto.schemaVersion,
      })
    )
      throw new RecusaDeRecuperacao("INTEGRIDADE");
    const base = abrirFotografia(documento);
    if (
      base.mundoId !== pedido.mundoId ||
      base.estado.id !== pedido.mundoId ||
      base.tick !== material.foto.tick ||
      base.tick !== base.estado.relogio.tick
    )
      throw new RecusaDeRecuperacao("INTEGRIDADE");
    const fatos: Fato[] = material.entradas.map((entrada) => {
      const fato = JSON.parse(leitura.decode(entrada.bytes));
      if (fato.id !== entrada.fatoId || fato.tick !== entrada.tick)
        throw new RecusaDeRecuperacao("INTEGRIDADE");
      return fato;
    });
    const mundo = restaurar(base, fatos);
    const reconstruida = mundo.fotografar();
    const bytes = gzipSync(JSON.stringify(reconstruida));
    if (bytes.length > pedido.fotografiaMaxBytes) throw new RecusaDeRecuperacao("LIMITE");
    return {
      pedido,
      material,
      fotografia: { bytes, tick: reconstruida.tick, schemaVersion: reconstruida.estado.versao },
      resumo: {
        mundoId: pedido.mundoId,
        operacaoId: pedido.operacaoId,
        revisaoFonte: pedido.revisaoFonte,
        revisaoEsperada: pedido.revisaoEsperada,
        novaRevisao: pedido.revisaoEsperada + 1,
        diarioSeq: material.mundo.journalSeq,
        tickFonte: base.tick,
        tickRecuperado: reconstruida.tick,
        fatosReaplicados: fatos.length,
        fotografiaBytes: bytes.length,
      },
    };
  } catch (erro) {
    if (erro instanceof RecusaDeRecuperacao) throw erro;
    // Erro de decoder/redutor pode conter conteúdo: o CLI recebe só o código.
    throw new RecusaDeRecuperacao("INTEGRIDADE");
  }
}

export async function aplicarRestauracaoDoMorada(
  preparada: Awaited<ReturnType<typeof prepararRestauracaoDoMorada>>,
) {
  return aplicarRecuperacao(preparada.pedido, preparada.material, preparada.fotografia);
}

/** A mesma operação recupera o recibo inclusive depois de o mundo voltar a jogar. */
export async function restaurarMorada(entrada: unknown) {
  const pedido = pedidoDoMorada(entrada);
  const anterior = await reciboDeRecuperacao(pedido);
  if (anterior) return anterior;
  try {
    return await aplicarRestauracaoDoMorada(await prepararRestauracaoDoMorada(entrada));
  } catch (erro) {
    // Outra tentativa da mesma operação pode ter confirmado enquanto esta
    // preparava. Ler o recibo antes de classificar a mudança como conflito.
    const confirmado = await reciboDeRecuperacao(pedido);
    if (confirmado) return confirmado;
    throw erro;
  }
}
