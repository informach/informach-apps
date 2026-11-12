import "server-only";
import { createHash } from "node:crypto";
import {
  BATIMENTO_MS,
  ErroDoRecreio,
  type InstanciaId,
  InstanciaIdSchema,
  type MundoId,
  MundoIdSchema,
  type PerfilId,
  POSSE_TTL_MS,
} from "@informach/recreio";
import {
  AnexarAoDiarioSchema,
  BatimentoSchema,
  base64ParaBytes,
  bytesParaBase64,
  ConsultaDaFotografiaSchema,
  cabecalhoParaJson,
  type EntradaPermitida,
  type InstanciaRegistrada,
  LiberarPosseSchema,
  type MetaDeFotografia,
  type MundoAberto,
  PedidoDeEntradaSchema,
  type PosseReivindicada,
  RegistroDeInstanciaSchema,
  type RespostaDoBatimento,
  ResumoDoMundoSchema,
} from "@informach/recreio/contrato";
import { z } from "zod";
import { enderecoDaInstanciaAceito, jogoQueAbre, limitesDoJogo } from "@/features/jogos/config";
import { politicaDoPerfil } from "@/features/sessao-de-jogo/politica";
import { exigirAcesso } from "@/features/sessao-de-jogo/service";
import { audit } from "@/lib/observability";
import {
  abrirMundoParaMembro,
  anexarAoDiarioDoMundo,
  drenarInstancia,
  gravarFotografiaDoMundo,
  instanciaDoJogo,
  lerDiarioDoMundo,
  lerFotografiaDoMundo,
  liberarPosseDoMundo,
  registrarBatimento,
  registrarInstancia,
  reivindicarPosse,
  verificarEntradaNoMundo,
} from "./repository";

/**
 * A API das instâncias e a abertura de um mundo. Quem chama já autenticou: as
 * rotas `/api/interno/v1` entregam o jogo do segredo e a instância do pedido;
 * a rota do SDK entrega o perfil e o jogo da sessão de jogo. Aqui entram a
 * validação da entrada, os tetos do jogo e a tradução para o contrato.
 */

/** Quem fala na API das instâncias: o jogo do segredo e a instância registrada. */
export type Host = { jogo: string; instanciaId: InstanciaId };

const naoNegativo = z.number().int().nonnegative();

/** Id de mundo que não tem a forma de um id responde como mundo que não existe. */
function mundoDoHost(mundoId: unknown): MundoId {
  const id = MundoIdSchema.safeParse(mundoId);
  if (!id.success) throw new ErroDoRecreio("NAO_ENCONTRADO");
  return id.data;
}

/** Uma escrita com a posse perdida fica registrada: é o sinal de instância obsoleta. */
async function comRegistroDeRecusa<T>(
  host: Host,
  mundoId: MundoId,
  cerca: number,
  operacao: "journal" | "snapshot" | "release",
  escrever: () => Promise<T>,
): Promise<T> {
  try {
    return await escrever();
  } catch (erro) {
    if (erro instanceof ErroDoRecreio && erro.codigo === "POSSE_PERDIDA")
      audit({
        eventType: "recreio.space_write_refused",
        actorId: null,
        payload: {
          spaceId: mundoId,
          gameId: host.jogo,
          instanceId: host.instanciaId,
          fence: cerca,
          operation: operacao,
        },
      });
    throw erro;
  }
}

export async function registrar(jogo: string, entrada: unknown): Promise<InstanciaRegistrada> {
  const registro = RegistroDeInstanciaSchema.parse(entrada);
  // O jogo é o do segredo; o corpo não escolhe outro.
  if (registro.jogo !== jogo) throw new ErroDoRecreio("ENTRADA_INVALIDA");
  jogoQueAbre(jogo);
  if (!enderecoDaInstanciaAceito(jogo, registro.urlPublica))
    throw new ErroDoRecreio("ENTRADA_INVALIDA");
  const instanciaId = await registrarInstancia({
    jogo,
    urlPublica: registro.urlPublica,
    versao: registro.versao,
    capacidade: registro.capacidade,
  });
  return { instanciaId, batimentoMs: BATIMENTO_MS, posseTtlMs: POSSE_TTL_MS };
}

/**
 * A instância de um pedido: registrada e deste jogo. Id sem a forma de um id,
 * instância que não existe e instância de outro jogo dão a mesma recusa.
 */
export async function instanciaRegistrada(jogo: string, instanciaId: unknown): Promise<Host> {
  const id = InstanciaIdSchema.safeParse(instanciaId);
  if (!id.success || !(await instanciaDoJogo(id.data, jogo)))
    throw new ErroDoRecreio("NAO_AUTENTICADO");
  return { jogo, instanciaId: id.data };
}

export async function batimento(host: Host, entrada: unknown): Promise<RespostaDoBatimento> {
  const pedido = BatimentoSchema.parse(entrada);
  let cursor: number | null = null;
  if (pedido.cursor !== null) {
    if (!/^\d{1,15}$/.test(pedido.cursor)) throw new ErroDoRecreio("ENTRADA_INVALIDA");
    cursor = Number(pedido.cursor);
  }
  const resultado = await registrarBatimento({
    instanciaId: host.instanciaId,
    jogo: host.jogo,
    mundos: pedido.mundos,
    cursor,
  });
  if (!resultado) throw new ErroDoRecreio("NAO_AUTENTICADO");
  return { ...resultado, cursor: String(resultado.cursor) };
}

export async function drenar(host: Host): Promise<void> {
  if (!(await drenarInstancia(host.instanciaId, host.jogo)))
    throw new ErroDoRecreio("NAO_AUTENTICADO");
}

export async function reivindicar(host: Host, mundoId: unknown): Promise<PosseReivindicada> {
  return reivindicarPosse({
    mundoId: mundoDoHost(mundoId),
    jogo: host.jogo,
    instanciaId: host.instanciaId,
  });
}

export async function lerFotografia(
  host: Host,
  mundoId: unknown,
  cerca: unknown,
): Promise<{ meta: MetaDeFotografia; bytes: Uint8Array } | null> {
  return lerFotografiaDoMundo({
    mundoId: mundoDoHost(mundoId),
    jogo: host.jogo,
    instanciaId: host.instanciaId,
    cerca: naoNegativo.parse(cerca),
  });
}

export async function lerDiario(
  host: Host,
  mundoId: unknown,
  consulta: { cerca: unknown; apos: unknown },
): Promise<{ entradas: { seq: number; tick: number; fatoId: string; bytes: string }[] }> {
  const entradas = await lerDiarioDoMundo({
    mundoId: mundoDoHost(mundoId),
    jogo: host.jogo,
    instanciaId: host.instanciaId,
    cerca: naoNegativo.parse(consulta.cerca),
    apos: naoNegativo.parse(consulta.apos),
  });
  return {
    entradas: entradas.map((entrada) => ({ ...entrada, bytes: bytesParaBase64(entrada.bytes) })),
  };
}

export async function verificarEntrada(
  host: Host,
  mundoId: unknown,
  entrada: unknown,
): Promise<EntradaPermitida> {
  const pedido = PedidoDeEntradaSchema.parse(entrada);
  const permitida = await verificarEntradaNoMundo({
    mundoId: mundoDoHost(mundoId),
    jogo: host.jogo,
    instanciaId: host.instanciaId,
    cerca: pedido.cerca,
    sid: pedido.sid,
    perfilId: pedido.perfilId,
  });
  const politica = politicaDoPerfil(permitida);
  return {
    membroId: permitida.membroId,
    papel: permitida.papel,
    participacao: permitida.participacao,
    apelido: permitida.apelido,
    avatar: permitida.avatar,
    politica: {
      multiplayer: politica.multiplayer,
      textoLivre: politica.textoLivre,
      versao: politica.versao,
    },
  };
}

/**
 * Teto do corpo de um lote do diário: os bytes em base64 mais o JSON em volta.
 * Passou disso, nem é lido.
 */
export function tetoDoCorpoDoDiario(jogo: string): number {
  return Math.ceil((limitesDoJogo(jogo).diarioLoteMaxBytes * 4) / 3) + 256 * 512 + 4096;
}

export async function anexarAoDiario(
  host: Host,
  mundoId: unknown,
  entrada: unknown,
): Promise<{ confirmadoAte: number }> {
  const id = mundoDoHost(mundoId);
  const pedido = AnexarAoDiarioSchema.parse(entrada);
  const limites = limitesDoJogo(host.jogo);
  return comRegistroDeRecusa(host, id, pedido.cerca, "journal", () =>
    anexarAoDiarioDoMundo({
      mundoId: id,
      jogo: host.jogo,
      instanciaId: host.instanciaId,
      cerca: pedido.cerca,
      entradas: pedido.entradas.map((item) => ({
        seq: item.seq,
        tick: item.tick,
        fatoId: item.fatoId,
        bytes: base64ParaBytes(item.bytes),
      })),
      loteMaxBytes: limites.diarioLoteMaxBytes,
      pendenteMaxBytes: limites.diarioPendenteMaxBytes,
    }),
  );
}

/** O maior corpo de fotografia que a rota lê para este jogo. */
export function tetoDaFotografia(jogo: string): number {
  return limitesDoJogo(jogo).fotografiaMaxBytes;
}

export async function gravarFotografia(
  host: Host,
  mundoId: unknown,
  consulta: unknown,
  /** `null` quando o corpo passou do teto e não foi lido inteiro. */
  bytes: Uint8Array | null,
  /** O cabeçalho do resumo como veio, ou `null`. */
  cabecalhoDoResumo: string | null,
): Promise<{ revisao: number }> {
  const id = mundoDoHost(mundoId);
  const numeros = ConsultaDaFotografiaSchema.parse(consulta);
  let resumo: { titulo: string; subtitulo: string } | null = null;
  if (cabecalhoDoResumo !== null) {
    const lido = ResumoDoMundoSchema.safeParse(cabecalhoParaJson(cabecalhoDoResumo));
    if (!lido.success) throw new ErroDoRecreio("ENTRADA_INVALIDA");
    resumo = lido.data;
  }
  const conteudo = bytes ?? new Uint8Array(0);
  return comRegistroDeRecusa(host, id, numeros.cerca, "snapshot", () =>
    gravarFotografiaDoMundo({
      mundoId: id,
      jogo: host.jogo,
      instanciaId: host.instanciaId,
      cerca: numeros.cerca,
      revisaoEsperada: numeros.revisaoEsperada,
      foto: {
        schemaVersion: numeros.schemaVersion,
        diarioSeq: numeros.diarioSeq,
        tick: numeros.tick,
        tipo: numeros.tipo,
        bytes: conteudo,
        // O resumo de conteúdo é calculado aqui, nunca aceito de quem envia.
        sha256: createHash("sha256").update(conteudo).digest("hex"),
      },
      excedeuOTeto: bytes === null,
      resumo,
    }),
  );
}

export async function liberar(host: Host, mundoId: unknown, entrada: unknown): Promise<void> {
  const id = mundoDoHost(mundoId);
  const pedido = LiberarPosseSchema.parse(entrada);
  await comRegistroDeRecusa(host, id, pedido.cerca, "release", () =>
    liberarPosseDoMundo({
      mundoId: id,
      jogo: host.jogo,
      instanciaId: host.instanciaId,
      cerca: pedido.cerca,
      motivo: pedido.motivo,
    }),
  );
}

/**
 * O que o navegador pede ao abrir um mundo: confere o direito de jogar e
 * entra na posse vigente ou faz o Recreio atribuir uma nova. A cerca fica
 * para quem testa; a rota do SDK não a devolve.
 */
export async function abrirMundo(
  sessao: { perfilId: PerfilId; jogo: string },
  mundoId: unknown,
): Promise<MundoAberto & { cerca: number }> {
  const id = MundoIdSchema.safeParse(mundoId);
  // Id sem a forma de um id responde como mundo do qual não se é membro.
  if (!id.success) throw new ErroDoRecreio("NAO_MEMBRO");
  await exigirAcesso(sessao.perfilId, sessao.jogo);
  jogoQueAbre(sessao.jogo);
  const aberto = await abrirMundoParaMembro({
    mundoId: id.data,
    perfilId: sessao.perfilId,
    jogo: sessao.jogo,
  });
  return {
    mundoId: id.data,
    membroId: aberto.membroId,
    papel: aberto.papel,
    onde: "servidor",
    endereco: aberto.endereco,
    schemaVersion: aberto.schemaVersion,
    revisao: aberto.revisao,
    cerca: aberto.cerca,
  };
}
