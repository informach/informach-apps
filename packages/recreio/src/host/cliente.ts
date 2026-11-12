import {
  CABECALHO_DA_FOTOGRAFIA,
  CABECALHO_DA_INSTANCIA,
  CABECALHO_DO_JOGO,
  CABECALHO_DO_RESUMO,
  CAMINHO_DA_API_DO_HOST,
  type ClienteDoHost,
  DiarioConfirmadoSchema,
  DiarioLidoSchema,
  EntradaPermitidaSchema,
  FotografiaGravadaSchema,
  InstanciaRegistradaSchema,
  MetaDeFotografiaSchema,
  PosseReivindicadaSchema,
  RespostaDoBatimentoSchema,
} from "../contrato/host";
import { ErroDoRecreio } from "../dominio/erros";
import type { InstanciaId } from "../dominio/ids";
import {
  base64ParaBytes,
  bytesParaBase64,
  cabecalhoParaJson,
  jsonParaCabecalho,
} from "../transporte/bytes";
import { type Buscar, lerCorpo, pedir, semBarraFinal } from "../transporte/http";

export type OpcoesDoClienteDoHost = {
  /** Origem do Recreio, por exemplo `https://recreio.informach.com.br`. */
  baseUrl: string;
  /** O jogo deste servidor. O segredo só alcança os mundos dele. */
  jogo: string;
  /** O segredo do jogo (`RECREIO_HOST_SECRETS[jogo]` no Recreio). */
  segredo: string;
  fetch?: Buscar;
  /** Quanto esperar por uma resposta antes de desistir com `INDISPONIVEL`. */
  tempoLimiteMs?: number;
};

const TEMPO_LIMITE_MS = 10_000;

/**
 * Cliente HTTP da API das instâncias. É o `ClienteDoHost` de verdade: cada
 * método é um pedido a `/api/interno/v1` do Recreio, e toda recusa volta como
 * `ErroDoRecreio` com o código que o Recreio mandou. Rede fora do ar, tempo
 * esgotado e 5xx sem código viram `INDISPONIVEL`: a instância pode tentar de
 * novo, mas o prazo da posse continua correndo pelo relógio do Recreio.
 *
 * O cliente guarda o `instanciaId` devolvido por `registrar` e o manda em
 * `X-Recreio-Instancia`. Antes de registrar, qualquer outra chamada recusa com
 * `NAO_AUTENTICADO` sem sair para a rede.
 */
export function criarClienteDoHost(opcoes: OpcoesDoClienteDoHost): ClienteDoHost {
  const buscar: Buscar = opcoes.fetch ?? ((url, init) => fetch(url, init));
  const base = `${semBarraFinal(opcoes.baseUrl)}${CAMINHO_DA_API_DO_HOST}`;
  const tempoLimiteMs = opcoes.tempoLimiteMs ?? TEMPO_LIMITE_MS;
  let instanciaId: InstanciaId | null = null;

  function cabecalhos(extra: Record<string, string> = {}): Record<string, string> {
    return {
      authorization: `Bearer ${opcoes.segredo}`,
      [CABECALHO_DO_JOGO]: opcoes.jogo,
      ...(instanciaId === null ? {} : { [CABECALHO_DA_INSTANCIA]: instanciaId }),
      ...extra,
    };
  }

  function eu(): InstanciaId {
    if (instanciaId === null) throw new ErroDoRecreio("NAO_AUTENTICADO");
    return instanciaId;
  }

  function chamar(caminho: string, init: RequestInit): Promise<Response> {
    return pedir(buscar, `${base}${caminho}`, {
      ...init,
      signal: AbortSignal.timeout(tempoLimiteMs),
    });
  }

  function enviarJson(caminho: string, corpo: unknown): Promise<Response> {
    return chamar(caminho, {
      method: "POST",
      headers: cabecalhos({ "content-type": "application/json" }),
      body: JSON.stringify(corpo),
    });
  }

  const mundo = (mundoId: string) => `/mundos/${encodeURIComponent(mundoId)}`;

  return {
    async registrar(registro) {
      const resposta = await enviarJson("/instancias", { ...registro, jogo: opcoes.jogo });
      const registrada = await lerCorpo(resposta, InstanciaRegistradaSchema);
      instanciaId = registrada.instanciaId;
      return registrada;
    },

    async batimento(batimento) {
      const resposta = await enviarJson(`/instancias/${eu()}/batimento`, batimento);
      return lerCorpo(resposta, RespostaDoBatimentoSchema);
    },

    async drenar() {
      await enviarJson(`/instancias/${eu()}/drenar`, {});
    },

    async reivindicarPosse(mundoId) {
      eu();
      const resposta = await enviarJson(`${mundo(mundoId)}/posse/reivindicar`, {});
      return lerCorpo(resposta, PosseReivindicadaSchema);
    },

    async lerFotografia({ mundoId, cerca }) {
      eu();
      const resposta = await chamar(`${mundo(mundoId)}/fotografia?cerca=${cerca}`, {
        method: "GET",
        headers: cabecalhos(),
      });
      if (resposta.status === 204) return null;
      const meta = MetaDeFotografiaSchema.safeParse(
        cabecalhoParaJson(resposta.headers.get(CABECALHO_DA_FOTOGRAFIA) ?? ""),
      );
      if (!meta.success) throw new ErroDoRecreio("INDISPONIVEL");
      let bytes: Uint8Array;
      try {
        bytes = new Uint8Array(await resposta.arrayBuffer());
      } catch {
        throw new ErroDoRecreio("INDISPONIVEL");
      }
      // Corpo cortado no caminho não é fotografia.
      if (bytes.length !== meta.data.bytes) throw new ErroDoRecreio("INDISPONIVEL");
      return { meta: meta.data, bytes };
    },

    async lerDiario({ mundoId, cerca, apos }) {
      eu();
      const resposta = await chamar(`${mundo(mundoId)}/diario?cerca=${cerca}&apos=${apos}`, {
        method: "GET",
        headers: cabecalhos(),
      });
      const { entradas } = await lerCorpo(resposta, DiarioLidoSchema);
      return entradas.map((entrada) => ({ ...entrada, bytes: base64ParaBytes(entrada.bytes) }));
    },

    async verificarEntrada({ mundoId, cerca, sid, perfilId }) {
      eu();
      const resposta = await enviarJson(`${mundo(mundoId)}/entradas`, { cerca, sid, perfilId });
      return lerCorpo(resposta, EntradaPermitidaSchema);
    },

    async anexarAoDiario({ mundoId, cerca, entradas }) {
      eu();
      const resposta = await enviarJson(`${mundo(mundoId)}/diario`, {
        cerca,
        entradas: entradas.map((entrada) => ({
          seq: entrada.seq,
          tick: entrada.tick,
          fatoId: entrada.fatoId,
          bytes: bytesParaBase64(entrada.bytes),
        })),
      });
      return lerCorpo(resposta, DiarioConfirmadoSchema);
    },

    async gravarFotografia(foto) {
      eu();
      const consulta = new URLSearchParams({
        cerca: String(foto.cerca),
        revisaoEsperada: String(foto.revisaoEsperada),
        diarioSeq: String(foto.diarioSeq),
        tick: String(foto.tick),
        schemaVersion: String(foto.schemaVersion),
        tipo: foto.tipo,
      });
      const resposta = await chamar(`${mundo(foto.mundoId)}/fotografias?${consulta}`, {
        method: "PUT",
        headers: cabecalhos({
          "content-type": "application/octet-stream",
          ...(foto.resumo ? { [CABECALHO_DO_RESUMO]: jsonParaCabecalho(foto.resumo) } : {}),
        }),
        // Uma cópia com buffer próprio: o chamador pode reaproveitar o dele.
        body: new Uint8Array(foto.bytes),
      });
      return lerCorpo(resposta, FotografiaGravadaSchema);
    },

    async liberarPosse({ mundoId, cerca, motivo }) {
      eu();
      await enviarJson(`${mundo(mundoId)}/posse/liberar`, { cerca, motivo });
    },
  };
}
