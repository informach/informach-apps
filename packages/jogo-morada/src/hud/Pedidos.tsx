import type { EstadoDoMundo, PresencaVista } from "@informach/morada-sim";
import { pedidosAbertos } from "../modelo/painel";
import type { Controle } from "./controle";

/**
 * Os pedidos de vida em aberto: namoro, casamento, morar junto, bebê. Aparecem
 * para quem pode responder e para quem pediu e está esperando.
 */
export function Pedidos(props: {
  controle: Controle;
  estado: EstadoDoMundo;
  presenca: PresencaVista;
  jogadorId: string;
}) {
  const { controle, estado, presenca, jogadorId } = props;
  const pedidos = pedidosAbertos(estado, presenca, jogadorId);
  if (pedidos.length === 0) return null;

  const responder = (pedidoId: (typeof pedidos)[number]["pedidoId"], aceita: boolean) => {
    void controle.sessao.comandar(null, { t: "responder_pedido", pedidoId, aceita });
  };

  return (
    <section className="morada-painel morada-pedidos" aria-label="Pedidos esperando resposta">
      <h2>Pedidos</h2>
      <ul>
        {pedidos.map((pedido) => (
          <li key={pedido.pedidoId}>
            <p>{pedido.texto}.</p>
            {pedido.podeResponder ? (
              <div className="morada-par">
                <button
                  type="button"
                  className="morada-botao morada-botao-forte"
                  onClick={() => responder(pedido.pedidoId, true)}
                >
                  Aceitar
                </button>
                <button
                  type="button"
                  className="morada-botao"
                  onClick={() => responder(pedido.pedidoId, false)}
                >
                  Recusar
                </button>
              </div>
            ) : (
              <p className="morada-nota">Esperando a resposta de quem joga com a outra pessoa.</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
