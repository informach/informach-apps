import { copiar } from "../nucleo/canonico";
import { necessidadesNaNovaFase, registrarId, relacaoEntre } from "./estado";
import type { Fato } from "./fatos";
import type { MemoriaId, MoradorId } from "./ids";
import { exigir, inserir, obter, tem } from "./tabela";
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
  const dados = fato.dados;
  switch (dados.tipo) {
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
