import {
  admitirReciboDeEdicao,
  comandoDeEdicao,
  compactarRespostasDeEdicao,
  iniciarRegistroDeEdicoes,
} from "../comandos/edicao";
import { conferirCatalogoDePinturas } from "../comandos/pintura";
import { comContinuidadeEspacial } from "../espaco/continuidade";
import { canonico, copiar } from "../nucleo/canonico";
import { necessidadesNaNovaFase, registrarId, relacaoEntre } from "./estado";
import type { Fato } from "./fatos";
import type { MemoriaId, MoradorId } from "./ids";
import { verificarInvariantes } from "./invariantes";
import { PERMISSOES_DO_FUNDADOR } from "./permissoes";
import { exigir, inserir, obter, remover, tem } from "./tabela";
import type { EstadoDoMundo, Local, Memoria, Morador } from "./tipos";

/**
 * O redutor dos fatos. É o único lugar que muda o estado crítico, e é usado
 * dos dois lados: pela simulação ao vivo, quando o fato acontece, e pela
 * recuperação, ao reaplicar o diário sobre a última fotografia. Como o caminho
 * é o mesmo, os dois não divergem.
 *
 * Cada caso é idempotente: aplicar de novo um fato já aplicado não muda nada.
 */

function lembrar(
  estado: EstadoDoMundo,
  fato: Fato,
  id: MemoriaId | null,
  tipo: Memoria["tipo"],
  moradores: MoradorId[],
): void {
  if (id === null || estado.memorias.some((memoria) => memoria.id === id)) return;
  registrarId(estado, id);
  estado.memorias.push({ id, tick: fato.tick, tipo, familiaId: fato.familiaId, moradores });
}

/** Onde fica quem acabou de entrar em uma família: na entrada do lote dela. */
function naEntradaDoLote(estado: EstadoDoMundo, morador: Morador, loteId: string | null): Local {
  const lote = loteId ? obter(estado.lotes, loteId as keyof typeof estado.lotes.porId) : undefined;
  if (!lote) return morador.local;
  if (morador.local.t === "lote" && morador.local.loteId === lote.id) return morador.local;
  if (morador.local.t === "objeto" && morador.local.loteId === lote.id) return morador.local;
  return {
    t: "lote",
    loteId: lote.id,
    andar: 0,
    pos: [lote.entrada[0], lote.entrada[1]],
    frente: 180,
  };
}

export function reduzirFato(estado: EstadoDoMundo, fato: Fato): void {
  // Fatos mutáveis usam um contador durável, independente do tick. A
  // reaplicação também avança esse contador antes da próxima emissão.
  const sufixo = fato.id.slice(fato.id.lastIndexOf(":") + 1);
  if (/^fat_\d+$/.test(sufixo)) registrarId(estado, sufixo);
  const dados = fato.dados;
  switch (dados.tipo) {
    case "PinturasAdmitidas": {
      if (
        fato.id !== "catalogo:pinturas:1" ||
        fato.familiaId !== null ||
        fato.causa.autor !== "sim" ||
        fato.causa.comandoId !== null
      )
        throw new Error("Admissão de pintura sem identidade do host");
      const catalogo = conferirCatalogoDePinturas(dados.catalogo);
      if (estado.catalogoDePinturas && canonico(estado.catalogoDePinturas) !== canonico(catalogo))
        throw new Error("O catálogo de pinturas admitido é imutável");
      estado.catalogoDePinturas = catalogo;
      return;
    }
    case "EdicaoRegistrada": {
      const recibo = dados.recibo;
      if (
        fato.id !== comandoDeEdicao(recibo.autor, recibo.pedido.sequencia) ||
        fato.causa.comandoId !== fato.id ||
        fato.causa.autor !== recibo.autor ||
        fato.familiaId !== recibo.pedido.familiaId
      )
        throw new Error("Identidade divergente do fato de edição");
      const registro =
        estado.edicoes.find((item) => item.autor === recibo.autor) ??
        iniciarRegistroDeEdicoes(recibo.autor);
      const admitido = admitirReciboDeEdicao(registro, recibo);
      if (!admitido.aplicar) return;
      const efeito = dados.efeito;
      if (recibo.resultado.ok !== (efeito !== null))
        throw new Error("Efeito e recibo de edição divergentes");
      if (
        recibo.resultado.ok &&
        (recibo.resultado.tick !== fato.tick || efeito?.continuidade.tick !== fato.tick)
      )
        throw new Error("Tick de edição divergente");
      const novo = efeito ? comContinuidadeEspacial(estado, efeito.continuidade) : copiar(estado);
      novo.relogio.tick = Math.max(novo.relogio.tick, fato.tick);
      const familia = obter(novo.familias, recibo.pedido.familiaId);
      const lote = obter(novo.lotes, recibo.pedido.loteId);
      if (!familia || !lote || familia.loteId !== lote.id || lote.familiaId !== familia.id)
        throw new Error("Contexto divergente do fato de edição");
      if (efeito) {
        const id = efeito.anterior?.id ?? efeito.depois?.id;
        const atual = id ? (obter(novo.objetos, id) ?? null) : null;
        if (
          !id ||
          efeito.familiaId !== familia.id ||
          efeito.loteId !== lote.id ||
          efeito.saldoAnterior !== familia.fundo ||
          efeito.versaoDaFamiliaAnterior !== familia.versao ||
          efeito.revisaoDoEspacoAnterior !== lote.revisaoDoEspaco ||
          canonico(atual) !== canonico(efeito.anterior) ||
          !Number.isSafeInteger(efeito.saldo) ||
          efeito.saldo < 0 ||
          !Number.isSafeInteger(efeito.versaoDaFamilia) ||
          efeito.versaoDaFamilia < familia.versao ||
          !Number.isSafeInteger(efeito.revisaoDoEspaco) ||
          efeito.revisaoDoEspaco < lote.revisaoDoEspaco ||
          (efeito.depois && (efeito.depois.id !== id || efeito.depois.loteId !== lote.id))
        )
          throw new Error("Efeito incompatível com o estado da edição");
        if (efeito.depois) {
          if (atual) novo.objetos.porId[id] = copiar(efeito.depois);
          else inserir(novo.objetos, id, copiar(efeito.depois));
          registrarId(novo, id);
        } else remover(novo.objetos, id);
        familia.fundo = efeito.saldo;
        familia.versao = efeito.versaoDaFamilia;
        lote.revisaoDoEspaco = efeito.revisaoDoEspaco;
      }
      novo.edicoes = compactarRespostasDeEdicao([
        ...novo.edicoes.filter((item) => item.autor !== recibo.autor),
        admitido.registro,
      ]);
      const problemas = verificarInvariantes(novo);
      if (problemas.length) throw new Error(`Edição inválida: ${problemas.slice(0, 3).join("; ")}`);
      Object.assign(estado, novo);
      return;
    }
    case "FamiliaFundada": {
      if (estado.fundacao) {
        if (
          estado.fundacao.comandoId !== dados.recibo.comandoId ||
          estado.fundacao.autor !== dados.recibo.autor ||
          estado.fundacao.familiaId !== dados.familia.id
        )
          throw new Error("Fundação já registrada por outro fato");
        return;
      }
      const familia = dados.familia;
      const lote = familia.loteId ? obter(estado.lotes, familia.loteId) : undefined;
      if (
        estado.familias.ordem.length !== 0 ||
        !lote ||
        lote.familiaId !== null ||
        dados.recibo.familiaId !== familia.id ||
        fato.familiaId !== familia.id ||
        fato.causa.comandoId !== dados.recibo.comandoId ||
        fato.causa.autor !== dados.recibo.autor ||
        dados.moradores.length < 1 ||
        dados.moradores.length > estado.regras.maxMoradoresPorFamilia ||
        dados.moradores.some((morador) => morador.familiaId !== familia.id)
      )
        throw new Error("Fundação incompatível com o mundo");
      registrarId(estado, familia.id);
      inserir(estado.familias, familia.id, copiar(familia));
      lote.familiaId = familia.id;
      for (const morador of dados.moradores) {
        registrarId(estado, morador.id);
        inserir(estado.moradores, morador.id, copiar(morador));
      }
      for (const relacao of dados.relacoes) {
        inserir(estado.relacoes, relacao.id, copiar(relacao));
        for (const id of [relacao.a, relacao.b]) {
          const morador = exigir(estado.moradores, id);
          if (!morador.relacoes.includes(relacao.id)) morador.relacoes.push(relacao.id);
        }
      }
      estado.acessos.push({
        familiaId: familia.id,
        perfilId: dados.recibo.autor,
        permissoes: [...PERMISSOES_DO_FUNDADOR],
      });
      estado.fundacao = copiar(dados.recibo);
      return;
    }
    case "AcessoConcedido": {
      const existente = estado.acessos.find(
        (acesso) => acesso.perfilId === dados.perfilId && acesso.familiaId === dados.familiaId,
      );
      if (existente) existente.permissoes = [...dados.permissoes];
      else {
        estado.acessos.push({
          familiaId: dados.familiaId,
          perfilId: dados.perfilId,
          permissoes: [...dados.permissoes],
        });
      }
      return;
    }

    case "AcessoRevogado": {
      estado.acessos = estado.acessos.filter(
        (acesso) => !(acesso.perfilId === dados.perfilId && acesso.familiaId === dados.familiaId),
      );
      return;
    }

    case "PreferidoDefinido": {
      const morador = obter(estado.moradores, dados.moradorId);
      if (!morador) return;
      if (dados.perfilId === null) delete morador.preferidoDe;
      else morador.preferidoDe = dados.perfilId;
      return;
    }

    case "CasalMudou": {
      if (!tem(estado.moradores, dados.a) || !tem(estado.moradores, dados.b)) return;
      const relacao = relacaoEntre(estado, dados.a, dados.b);
      if (relacao.casal !== dados.casal) {
        relacao.casal = dados.casal;
        relacao.versao++;
      }
      if (dados.memoriaId && !relacao.marcos.includes(dados.memoriaId)) {
        relacao.marcos.push(dados.memoriaId);
      }
      lembrar(estado, fato, dados.memoriaId, dados.casal === "casamento" ? "casamento" : "namoro", [
        dados.a,
        dados.b,
      ]);
      return;
    }

    case "FamiliaMudou": {
      const morador = obter(estado.moradores, dados.moradorId);
      if (!morador) return;
      if (morador.familiaId !== dados.para) {
        morador.familiaId = dados.para;
        morador.versao++;
        // Identidade, relações, habilidades e carteira ficam como estavam.
        morador.local = naEntradaDoLote(estado, morador, dados.loteId);
        morador.movimento = null;
      }
      lembrar(estado, fato, dados.memoriaId, "mudanca", [dados.moradorId]);
      return;
    }

    case "GravidezIniciada": {
      if (!tem(estado.gravidezes, dados.gravidez.id)) {
        registrarId(estado, dados.gravidez.id);
        registrarId(estado, dados.gravidez.bebeId);
        inserir(estado.gravidezes, dados.gravidez.id, copiar(dados.gravidez));
      }
      const envolvidos = dados.gravidez.outroGenitorId
        ? [dados.gravidez.gestanteId, dados.gravidez.outroGenitorId]
        : [dados.gravidez.gestanteId];
      lembrar(estado, fato, dados.memoriaId, "gravidez", envolvidos);
      return;
    }

    case "NascimentoRegistrado": {
      const gravidez = obter(estado.gravidezes, dados.gravidezId);
      // O nascimento existe uma vez só: gravidez já concluída não nasce de novo.
      if (!gravidez || gravidez.estado === "concluida") return;
      gravidez.estado = "concluida";
      if (!tem(estado.moradores, dados.bebe.id)) {
        registrarId(estado, dados.bebe.id);
        inserir(estado.moradores, dados.bebe.id, copiar(dados.bebe));
      }
      for (const nova of dados.relacoes) {
        const relacao = relacaoEntre(estado, nova.a, nova.b);
        relacao.parentesco = copiar(nova.parentesco);
        relacao.eixos = { ...nova.eixos };
        relacao.versao++;
      }
      lembrar(estado, fato, dados.memoriaId, "nascimento", [
        dados.bebe.id,
        gravidez.gestanteId,
        ...(gravidez.outroGenitorId ? [gravidez.outroGenitorId] : []),
      ]);
      return;
    }

    case "FaseMudou": {
      const morador = obter(estado.moradores, dados.moradorId);
      if (!morador || morador.fase !== dados.de) return;
      morador.fase = dados.para;
      morador.idadeNaFaseMs = 0;
      morador.aparencia.corpo = dados.corpo;
      morador.necessidades = necessidadesNaNovaFase(morador.necessidades, dados.para);
      morador.versao++;
      // Quem deixa de ser bebê de colo sai do colo e passa a ficar no chão.
      if (morador.local.t === "colo") {
        const quemCarrega = exigir(estado.moradores, morador.local.de);
        morador.local =
          quemCarrega.local.t === "lote"
            ? { ...quemCarrega.local, pos: [quemCarrega.local.pos[0], quemCarrega.local.pos[1]] }
            : naEntradaDoLote(estado, morador, familiaLote(estado, morador));
      }
      lembrar(estado, fato, dados.memoriaId, "fase", [dados.moradorId]);
      return;
    }

    case "FundoMovimentado": {
      const familia = obter(estado.familias, dados.familiaId);
      if (!familia) return;
      if (familia.fundo !== dados.saldo) {
        familia.fundo = dados.saldo;
        familia.versao++;
      }
      return;
    }

    case "PedidoCriado": {
      if (tem(estado.pedidos, dados.pedido.id)) return;
      registrarId(estado, dados.pedido.id);
      inserir(estado.pedidos, dados.pedido.id, copiar(dados.pedido));
      return;
    }

    case "PedidoResolvido": {
      const pedido = obter(estado.pedidos, dados.pedidoId);
      if (pedido?.estado !== "aberto") return;
      pedido.estado = dados.aceito ? "aceito" : "recusado";
      pedido.motivo = dados.motivo;
      return;
    }
  }
}

function familiaLote(estado: EstadoDoMundo, morador: Morador): string | null {
  if (!morador.familiaId) return null;
  return obter(estado.familias, morador.familiaId)?.loteId ?? null;
}
