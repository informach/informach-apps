import type { Aviso, Loja } from "../espelho/loja";
import { Icone } from "./Icone";

/**
 * Os avisos de uma vez só: o que aconteceu no mundo (nasceu, casou, chegou
 * visita) e por que um pedido não deu certo. Somem sozinhos; a região avisa
 * os leitores de tela sem tirar o foco de onde a pessoa está.
 */
export function Avisos({ loja, avisos }: { loja: Loja; avisos: readonly Aviso[] }) {
  return (
    <div className="morada-avisos" role="status" aria-live="polite" aria-relevant="additions">
      {avisos.map((aviso) => (
        <div key={aviso.id} className="morada-aviso" data-tom={aviso.tom}>
          <span className="morada-aviso-marca">
            <Icone nome={aviso.tom === "recusa" ? "alerta" : "sino"} tamanho={14} />
          </span>
          <p>{aviso.texto}</p>
          <button
            type="button"
            className="morada-botao-icone"
            aria-label="Fechar aviso"
            onClick={() => loja.dispensarAviso(aviso.id)}
          >
            <Icone nome="fechar" tamanho={12} />
          </button>
        </div>
      ))}
    </div>
  );
}
