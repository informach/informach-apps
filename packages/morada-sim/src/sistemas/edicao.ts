import {
  AUTORES_DE_EDICAO_DO_MUNDO,
  consultarEdicao,
  iniciarRegistroDeEdicoes,
  LIMITE_DE_EDICAO_SEM_GESTAO_CENTAVOS,
  type PedidoDeEdicao,
  type ReciboDeEdicao,
} from "../comandos/edicao";
import { perfilDePintura } from "../comandos/pintura";
import type { DadosDoFato, Fato } from "../dominio/fatos";
import { montarId } from "../dominio/ids";
import { revisaoDosObjetos } from "../dominio/revisao-dos-objetos";
import { listar, obter } from "../dominio/tabela";
import type { Objeto, Resultado, Sessao } from "../dominio/tipos";
import { conferirColocacaoNoChao } from "../espaco/colocacao";
import { capturarContinuidadeEspacial } from "../espaco/continuidade";
import { copiar } from "../nucleo/canonico";
import { type Contexto, causaDoJogador, emitir } from "./contexto";
import { temPermissao } from "./presenca";

const OBJETOS_POR_LOTE = 256;
const FATO_MAX_BYTES_PADRAO = 256 * 1024;
type DadosDaEdicao = Extract<DadosDoFato, { tipo: "EdicaoRegistrada" }>;
type ResultadoAdmitido = ReciboDeEdicao["resultado"];

/** JSON já serializado: conta UTF-8 sem DOM/Node ou dependência de relógio. */
function tamanhoUtf8(texto: string): number {
  let bytes = 0;
  for (const caractere of texto) {
    const codigo = caractere.codePointAt(0);
    if (codigo === undefined) throw new Error("Caractere ausente");
    bytes += codigo <= 0x7f ? 1 : codigo <= 0x7ff ? 2 : codigo <= 0xffff ? 3 : 4;
  }
  return bytes;
}

function resposta(comandoId: string, resultado: ResultadoAdmitido): Resultado {
  if (resultado.ok)
    return { ok: true, comandoId, tick: resultado.tick, versoes: resultado.revisoes };
  const motivo =
    resultado.motivo === "limite"
      ? "politica_do_mundo"
      : resultado.motivo === "saldo_insuficiente" || resultado.motivo === "colocacao_invalida"
        ? "requisito"
        : resultado.motivo;
  return { ok: false, comandoId, motivo, detalhe: resultado.detalhe ?? resultado.motivo };
}

export function editarCasa(
  ctx: Contexto,
  sessao: Sessao,
  comandoId: string,
  pedido: PedidoDeEdicao,
): Resultado {
  const estado = ctx.estado;
  const registro =
    estado.edicoes.find((item) => item.autor === sessao.perfilId) ??
    iniciarRegistroDeEdicoes(sessao.perfilId);
  const acompanhar = (resultado: Resultado): Resultado => {
    const ultima =
      estado.edicoes.find((item) => item.autor === sessao.perfilId)?.ultimaSequencia ?? 0;
    return {
      ...resultado,
      edicao: { proximaSequencia: ultima < Number.MAX_SAFE_INTEGER ? ultima + 1 : null },
    };
  };
  const negar = (
    motivo: Extract<Resultado, { ok: false }>["motivo"],
    detalhe?: string,
  ): Resultado => acompanhar({ ok: false, comandoId, motivo, ...(detalhe ? { detalhe } : {}) });
  const familia = obter(estado.familias, pedido.familiaId);
  const lote = obter(estado.lotes, pedido.loteId);
  if (
    !familia ||
    !lote ||
    familia.loteId !== lote.id ||
    lote.familiaId !== familia.id ||
    !temPermissao(estado, sessao.perfilId, familia.id, "decorar")
  )
    return negar("sem_permissao");
  const pode = (permissoes: ReciboDeEdicao["permissoes"]): boolean =>
    permissoes.every((permissao) => temPermissao(estado, sessao.perfilId, familia.id, permissao));
  const consulta = consultarEdicao(registro, sessao.perfilId, comandoId, pedido);
  if (consulta.t === "recusada")
    return negar(
      consulta.motivo === "identidade" || consulta.motivo === "conflito"
        ? "comando_invalido"
        : "versao_antiga",
      `edicao_${consulta.motivo}`,
    );
  if (consulta.t === "repetida") {
    if (!pode(consulta.recibo.permissoes)) return negar("sem_permissao");
    return acompanhar({ ...resposta(comandoId, consulta.recibo.resultado), repetido: true });
  }
  if (
    !estado.edicoes.some((item) => item.autor === sessao.perfilId) &&
    estado.edicoes.length >= AUTORES_DE_EDICAO_DO_MUNDO
  )
    return negar("politica_do_mundo", "historico_de_edicao_cheio");
  const operacao = pedido.operacao;
  const anterior =
    operacao.t === "comprar" ? null : (obter(estado.objetos, operacao.objetoId) ?? null);
  const oferta = estado.loja.ofertas.find(
    (item) => item.catalogo === (operacao.t === "comprar" ? operacao.catalogo : anterior?.catalogo),
  );
  const permissoes: ReciboDeEdicao["permissoes"] = ["decorar"];
  if (operacao.t === "comprar") permissoes.push("gastar");
  const valor =
    operacao.t === "comprar"
      ? (oferta?.compraCentavos ?? 0)
      : operacao.t === "vender"
        ? (oferta?.revendaCentavos ?? 0)
        : 0;
  if (valor > LIMITE_DE_EDICAO_SEM_GESTAO_CENTAVOS) permissoes.push("gerir_financas");
  if (!pode(permissoes)) return negar("sem_permissao");

  let resultado: ResultadoAdmitido | null = null;
  const recusar = (
    motivo: Extract<ResultadoAdmitido, { ok: false }>["motivo"],
    detalhe?: string,
  ) => {
    resultado = { ok: false, motivo, ...(detalhe ? { detalhe } : {}) };
  };
  let depois: Objeto | null = anterior ? copiar(anterior) : null;
  const revisaoAnterior = revisaoDosObjetos(estado);
  const revisaoNova = revisaoAnterior + 1;
  let delta = 0;
  const espacial = operacao.t !== "pintar";
  if (operacao.t === "comprar") {
    const numero = (estado.contadores.obj ?? 0) + 1;
    if (!oferta || oferta.versaoDoCatalogo !== operacao.versaoDoCatalogo) recusar("nao_existe");
    else if (estado.loja.politicaDePrecos !== operacao.politicaDePrecos) recusar("versao_antiga");
    else if (
      listar(estado.objetos).filter((item) => item.loteId === lote.id).length >= OBJETOS_POR_LOTE ||
      !Number.isSafeInteger(numero)
    )
      recusar("limite");
    else {
      depois = {
        id: montarId("obj", numero),
        loteId: lote.id,
        catalogo: oferta.catalogo,
        versao: oferta.versaoDoCatalogo,
        revisao: revisaoNova,
        ...copiar(operacao.colocacao),
        cor: 0xffffff,
        pintura: copiar(operacao.pintura),
        ocupacao: {},
      };
      delta = -oferta.compraCentavos;
    }
  } else if (!anterior || anterior.loteId !== lote.id) recusar("nao_existe");
  else if (anterior.revisao !== operacao.revisaoDoObjeto) recusar("versao_antiga");
  else if (Object.keys(anterior.ocupacao).length) recusar("ocupado");
  else if (!Number.isSafeInteger(revisaoNova)) recusar("limite");
  else if (operacao.t === "vender") {
    if (!oferta || oferta.versaoDoCatalogo !== anterior.versao) recusar("nao_existe");
    else if (estado.loja.politicaDePrecos !== operacao.politicaDePrecos) recusar("versao_antiga");
    else {
      depois = null;
      delta = oferta.revendaCentavos;
    }
  } else if (operacao.t === "mover")
    depois = { ...copiar(anterior), ...copiar(operacao.colocacao), revisao: revisaoNova };
  else
    depois = {
      ...copiar(anterior),
      pintura: copiar(operacao.pintura),
      revisao: revisaoNova,
    };
  if (!resultado && depois?.pintura) {
    const admitido = perfilDePintura(estado.catalogoDePinturas, depois);
    const disponivel = perfilDePintura(ctx.pinturasDisponiveis ?? null, depois);
    if (admitido?.perfil !== depois.pintura.perfil || disponivel?.perfil !== depois.pintura.perfil)
      recusar("nao_existe", "pintura_indisponivel");
  }
  if (!resultado && operacao.t !== "pintar" && operacao.revisaoDoEspaco !== lote.revisaoDoEspaco)
    recusar("versao_antiga");
  const saldo = familia.fundo + delta;
  if (!resultado && !Number.isSafeInteger(familia.fundo))
    throw new Error("Saldo não representável na edição");
  if (
    !resultado &&
    (!Number.isSafeInteger(saldo) ||
      !Number.isSafeInteger(revisaoNova) ||
      !Number.isSafeInteger(familia.versao + 1) ||
      !Number.isSafeInteger(lote.revisaoDoEspaco + 1))
  )
    recusar("limite");
  if (!resultado && saldo < 0) recusar("saldo_insuficiente");
  const id = depois?.id ?? anterior?.id;
  if (!resultado && id && espacial) {
    const impedimento = conferirColocacaoNoChao(estado, id, depois);
    if (impedimento)
      recusar(impedimento === "ocupado" ? "ocupado" : "colocacao_invalida", impedimento);
  }
  if (!resultado && !id) recusar("nao_existe");
  const revisoes: Record<string, number> = {
    [familia.id]: familia.versao + (delta !== 0 ? 1 : 0),
    [lote.id]: lote.revisaoDoEspaco + (espacial ? 1 : 0),
  };
  if (id) revisoes[id] = revisaoNova;
  const recibo: ReciboDeEdicao = {
    autor: sessao.perfilId,
    permissoes,
    pedido: copiar(pedido),
    resultado: resultado ?? { ok: true, tick: estado.relogio.tick, revisoes },
  };
  let dados: DadosDaEdicao = {
    tipo: "EdicaoRegistrada",
    recibo,
    efeito: recibo.resultado.ok
      ? {
          familiaId: familia.id,
          loteId: lote.id,
          saldoAnterior: familia.fundo,
          saldo,
          versaoDaFamiliaAnterior: familia.versao,
          versaoDaFamilia: revisoes[familia.id] ?? familia.versao,
          revisaoDoEspacoAnterior: lote.revisaoDoEspaco,
          revisaoDoEspaco: revisoes[lote.id] ?? lote.revisaoDoEspaco,
          revisaoDosObjetosAnterior: revisaoAnterior,
          revisaoDosObjetos: revisaoNova,
          anterior: anterior ? copiar(anterior) : null,
          depois,
          continuidade: capturarContinuidadeEspacial(estado),
        }
      : null,
  };
  const causa = causaDoJogador(comandoId, sessao.perfilId, "edicao_de_casa");
  const fato = (): Fato => ({
    id: comandoId,
    tick: estado.relogio.tick,
    familiaId: familia.id,
    causa,
    dados,
  });
  const maxBytes = ctx.maxBytesPorFato ?? FATO_MAX_BYTES_PADRAO;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new Error("Limite inválido do diário");
  if (tamanhoUtf8(JSON.stringify(fato())) > maxBytes) {
    dados = {
      tipo: "EdicaoRegistrada",
      recibo: {
        ...recibo,
        resultado: { ok: false, motivo: "limite", detalhe: "edicao_acima_do_limite" },
      },
      efeito: null,
    };
    if (tamanhoUtf8(JSON.stringify(fato())) > maxBytes)
      return negar("politica_do_mundo", "edicao_acima_do_limite");
  }
  if (!emitir(ctx, comandoId, familia.id, dados, causa))
    throw new Error("Fato de edição não emitido");
  return acompanhar(resposta(comandoId, dados.recibo.resultado));
}
