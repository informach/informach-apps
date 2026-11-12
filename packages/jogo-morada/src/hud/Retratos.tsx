import type { EstadoDoMundo, Fase, PresencaVista } from "@informach/morada-sim";
import type { MouseEvent } from "react";
import { type OpcoesDosRetratos, type Retrato, retratosDe } from "../modelo/retratos";
import type { Controle } from "./controle";

/**
 * Os retratos da família: é por eles que se escolhe quem dirigir. Cada um diz,
 * pela moldura e pela plaquinha, se está livre, com você, com outra pessoa ou
 * por conta própria.
 */

function corDaPele(pele: number): string {
  return `#${(pele & 0xffffff).toString(16).padStart(6, "0")}`;
}

/** Um rosto simples no lugar da foto, com a pele do morador e o tamanho da fase. */
export function Rosto({ pele, fase }: { pele: number; fase: Fase }) {
  return (
    <span className={`morada-rosto morada-rosto-${fase}`} aria-hidden="true">
      <span className="morada-rosto-ombros" />
      <span className="morada-rosto-cabeca" style={{ background: corDaPele(pele) }} />
    </span>
  );
}

function oQueFaz(retrato: Retrato): string {
  if (retrato.cuidados) return "Abre os cuidados.";
  if (retrato.estado === "voce") return "Toque para soltar.";
  if (retrato.estado === "disponivel") return "Toque para dirigir.";
  return "";
}

export function Retratos(props: {
  controle: Controle;
  estado: EstadoDoMundo;
  presenca: PresencaVista;
  eu: OpcoesDosRetratos;
}) {
  const { controle, estado, presenca, eu } = props;
  const { sessao } = controle;
  const retratos = retratosDe(estado, presenca, eu);
  const selecionado = sessao.loja.meuMoradorId() ?? sessao.loja.selecionadoId;

  const tocar = (retrato: Retrato, evento: MouseEvent<HTMLButtonElement>) => {
    sessao.loja.selecionar(retrato.moradorId);
    if (retrato.cuidados) {
      // O menu de cuidados abre acima do retrato, dentro da área do jogo.
      const raiz = evento.currentTarget.closest(".morada");
      const caixa = evento.currentTarget.getBoundingClientRect();
      const base = raiz?.getBoundingClientRect();
      sessao.loja.abrirMenu({
        alvo: { t: "cuidados", bebeId: retrato.moradorId },
        x: caixa.left + caixa.width / 2 - (base?.left ?? 0),
        y: caixa.top - (base?.top ?? 0) - 150,
      });
      return;
    }
    void sessao.comandar(
      retrato.moradorId,
      retrato.estado === "voce" ? { t: "liberar" } : { t: "reservar" },
    );
  };

  return (
    <section className="morada-painel morada-retratos" aria-label="Moradores da família">
      <ul>
        {retratos.map((retrato) => (
          <li key={retrato.moradorId}>
            <button
              type="button"
              className="morada-retrato"
              data-estado={retrato.estado}
              data-espera={retrato.emEspera ? "sim" : undefined}
              data-morador={retrato.moradorId}
              aria-pressed={retrato.estado === "voce"}
              aria-current={selecionado === retrato.moradorId ? "true" : undefined}
              aria-label={`${retrato.nome}, ${retrato.rotuloDaFase}. ${retrato.legenda}. ${oQueFaz(retrato)}`}
              title={retrato.legenda}
              onClick={(evento) => tocar(retrato, evento)}
            >
              <span className="morada-moldura">
                <Rosto pele={retrato.pele} fase={retrato.fase} />
              </span>
              <span className="morada-placa">{retrato.placa}</span>
              <span className="morada-retrato-nome">{retrato.nome}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
