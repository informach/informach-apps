import {
  CABECALHO_DA_FOTOGRAFIA,
  CABECALHO_DA_INSTANCIA,
  CABECALHO_DO_JOGO,
  CABECALHO_DO_RESUMO,
  CAMINHO_DA_API_DO_HOST,
  CheckpointDoHostSchema,
  type ClienteDoHost,
  type ClienteDoHostComCheckpoint,
  DIARIO_PAGINA_MAX_BYTES,
  DIARIO_RECUPERACAO_MAX_ENTRADAS,
  DiarioConfirmadoSchema,
  DiarioLidoSchema,
  EntradaPermitidaSchema,
  FotografiaGravadaSchema,
  InstanciaRegistradaSchema,
  MetaDeFotografiaSchema,
  PosseReivindicadaSchema,
  RespostaDoBatimentoSchema,
} from "../contrato/host";
import { ResultadoDeCheckpointSchema } from "../contrato/sdk";
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
  /** Teto comprimido do manifesto do jogo; aplicado antes de alocar o corpo. */
  fotografiaMaxBytes: number;
  /** Teto total do diário necessário à recuperação, do catálogo do jogo. */
  diarioMaxBytes: number;
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
export function criarClienteDoHost(opcoes: OpcoesDoClienteDoHost): ClienteDoHostComCheckpoint {
  if (!Number.isSafeInteger(opcoes.fotografiaMaxBytes) || opcoes.fotografiaMaxBytes <= 0)
    throw new Error("fotografiaMaxBytes precisa ser um inteiro positivo");
  if (!Number.isSafeInteger(opcoes.diarioMaxBytes) || opcoes.diarioMaxBytes <= 0)
    throw new Error("diarioMaxBytes precisa ser um inteiro positivo");
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
      if (!meta.success || meta.data.bytes > opcoes.fotografiaMaxBytes) {
        await resposta.body?.cancel();
        throw new ErroDoRecreio("INDISPONIVEL");
      }
      let bytes: Uint8Array;
      try {
        // O Content-Length pode mentir ou estar ausente. Nunca acumulamos
        // mais do que os metadados já limitados pelo manifesto permitem.
        const leitor = resposta.body?.getReader();
        if (!leitor) throw new ErroDoRecreio("INDISPONIVEL");
        bytes = new Uint8Array(meta.data.bytes);
        let recebidos = 0;
        let terminou = false;
        try {
          for (;;) {
            const parte = await leitor.read();
            if (parte.done) {
              terminou = true;
              break;
            }
            if (parte.value.length > bytes.length - recebidos)
              throw new ErroDoRecreio("INDISPONIVEL");
            bytes.set(parte.value, recebidos);
            recebidos += parte.value.length;
          }
          if (recebidos !== bytes.length) throw new ErroDoRecreio("INDISPONIVEL");
        } finally {
          try {
            if (!terminou) await leitor.cancel();
          } finally {
            leitor.releaseLock();
          }
        }
      } catch {
        throw new ErroDoRecreio("INDISPONIVEL");
      }
      // A identidade do conteúdo é conferida antes de entregar para descompactação.
      const resumo = new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes)));
      const sha256 = Array.from(resumo, (byte) => byte.toString(16).padStart(2, "0")).join("");
      if (sha256 !== meta.data.sha256) throw new ErroDoRecreio("INDISPONIVEL");
      return { meta: meta.data, bytes };
    },

    async lerDiario({ mundoId, cerca, apos }) {
      eu();
      const diario: Awaited<ReturnType<ClienteDoHost["lerDiario"]>> = [];
      let cursor = apos;
      let total = 0;
      for (;;) {
        const resposta = await chamar(`${mundo(mundoId)}/diario?cerca=${cerca}&apos=${cursor}`, {
          method: "GET",
          headers: cabecalhos(),
        });
        const { entradas, proximoApos } = await lerCorpo(
          resposta,
          DiarioLidoSchema,
          DIARIO_PAGINA_MAX_BYTES * 2 + 65_536,
        );
        for (const entrada of entradas) {
          if (diario.length >= DIARIO_RECUPERACAO_MAX_ENTRADAS)
            throw new ErroDoRecreio("INDISPONIVEL");
          if (entrada.seq !== cursor + 1) throw new ErroDoRecreio("SEQUENCIA");
          const bytes = base64ParaBytes(entrada.bytes);
          total += bytes.length;
          if (total > opcoes.diarioMaxBytes) throw new ErroDoRecreio("INDISPONIVEL");
          diario.push({ ...entrada, bytes });
          cursor = entrada.seq;
        }
        if (proximoApos === undefined || proximoApos === null) return diario;
        if (cursor <= apos || cursor !== proximoApos || entradas.length === 0)
          throw new ErroDoRecreio("SEQUENCIA");
      }
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
    async confirmarCheckpoint({ mundoId, ...entrada }) {
      eu();
      const pedido = CheckpointDoHostSchema.parse(entrada);
      return lerCorpo(
        await enviarJson(`${mundo(mundoId)}/checkpoint`, pedido),
        ResultadoDeCheckpointSchema,
      );
    },
  };
}
