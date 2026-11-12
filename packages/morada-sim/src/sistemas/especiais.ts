import type { Especial } from "../conteudo/esquema";
import type { PerfilId } from "../dominio/ids";
import { obter } from "../dominio/tabela";
import type { Alvo, Morador } from "../dominio/tipos";
import { bebeNoColoDe, ondeEsta, PONTO_DENTRO } from "../espaco/posicoes";
import { apresentar, type Contexto, tocar } from "./contexto";
import { fazerPedido } from "./relacoes";

/**
 * Os passos de uma interação que precisam de regra própria ao concluir: pegar
 * e acomodar um bebê, e os pedidos de vida.
 */

export type ContextoDoEspecial = {
  ator: Morador;
  alvo: Alvo;
  autor: PerfilId | null;
  comandoId: string | null;
};

export function aplicarEspecial(
  ctx: Contexto,
  especial: Especial,
  dados: ContextoDoEspecial,
): void {
  const estado = ctx.estado;
  const tick = estado.relogio.tick;
  const { ator, alvo } = dados;
  const moradorAlvo = alvo.t === "morador" ? obter(estado.moradores, alvo.moradorId) : undefined;
  const onde = ondeEsta(estado, ator, tick);

  switch (especial) {
    case "pegar_no_colo": {
      if (moradorAlvo?.fase !== "colo" || moradorAlvo.local.t === "colo") return;
      if (bebeNoColoDe(estado, ator.id)) return;
      if (moradorAlvo.local.t === "objeto") {
        const berco = obter(estado.objetos, moradorAlvo.local.objetoId);
        if (berco && berco.ocupacao[PONTO_DENTRO] === moradorAlvo.id) {
          delete berco.ocupacao[PONTO_DENTRO];
          tocar(ctx, "objetos", berco.id);
        }
      }
      moradorAlvo.local = { t: "colo", de: ator.id };
      moradorAlvo.movimento = null;
      tocar(ctx, "moradores", moradorAlvo.id);
      return;
    }

    case "por_no_berco": {
      const bebe = bebeNoColoDe(estado, ator.id);
      const berco = alvo.t === "objeto" ? obter(estado.objetos, alvo.objetoId) : undefined;
      if (!bebe || !berco) return;
      if (berco.ocupacao[PONTO_DENTRO] !== undefined) {
        apresentar(ctx, {
          t: "recusou",
          loteId: onde?.loteId ?? null,
          moradorId: ator.id,
          motivo: "ocupado",
        });
        return;
      }
      berco.ocupacao[PONTO_DENTRO] = bebe.id;
      bebe.local = { t: "objeto", loteId: berco.loteId, objetoId: berco.id, ponto: PONTO_DENTRO };
      tocar(ctx, "objetos", berco.id);
      tocar(ctx, "moradores", bebe.id);
      return;
    }

    case "por_no_chao": {
      const bebe = bebeNoColoDe(estado, ator.id);
      if (!bebe || !onde) return;
      bebe.local = {
        t: "lote",
        loteId: onde.loteId,
        andar: onde.andar,
        pos: [onde.pos[0], onde.pos[1]],
        frente: 0,
      };
      tocar(ctx, "moradores", bebe.id);
      return;
    }

    case "propor_namoro":
    case "propor_casamento":
    case "propor_morar_junto":
    case "propor_bebe": {
      if (!moradorAlvo) return;
      const tipo =
        especial === "propor_namoro"
          ? "namoro"
          : especial === "propor_casamento"
            ? "casamento"
            : especial === "propor_morar_junto"
              ? "morar_junto"
              : "bebe";
      fazerPedido(ctx, tipo, ator, moradorAlvo, dados.autor, dados.comandoId);
      return;
    }

    case "despedir": {
      // Só quem é visita vai embora ao se despedir.
      if (!moradorAlvo || moradorAlvo.familiaId !== null || moradorAlvo.local.t === "fora") return;
      estado.agenda = estado.agenda.filter((evento) => evento.moradorId !== moradorAlvo.id);
      moradorAlvo.local = { t: "fora", motivo: "visita_encerrada" };
      moradorAlvo.movimento = null;
      tocar(ctx, "moradores", moradorAlvo.id);
      apresentar(ctx, {
        t: "visita",
        loteId: onde?.loteId ?? null,
        moradorId: moradorAlvo.id,
        chegou: false,
      });
      return;
    }
  }
}
