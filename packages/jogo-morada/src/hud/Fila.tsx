import { type EstadoDoMundo, type MoradorId, obter } from "@informach/morada-sim";
import { filaDe, type ItemDaFila } from "../modelo/painel";
import type { Controle } from "./controle";
import { Icone } from "./Icone";

/**
 * A fila do morador que a pessoa dirige: o que ele faz agora e o que vem
 * depois, com o cancelar de cada item. Fila vazia não é ociosidade: o morador
 * volta a decidir sozinho.
 */

const SITUACOES: Record<ItemDaFila["situacao"], string> = {
  na_fila: "na fila",
  indo: "a caminho",
  esperando: "esperando a vez",
  executando: "fazendo",
};

export function Fila(props: {
  controle: Controle;
  estado: EstadoDoMundo;
  meuMoradorId: MoradorId | null;
}) {
  const { controle, estado, meuMoradorId } = props;
  const morador = meuMoradorId ? obter(estado.moradores, meuMoradorId) : undefined;

  if (!meuMoradorId || !morador) {
    return (
      <section className="morada-painel morada-fila" aria-label="Fila de ações">
        <h2>Fila</h2>
        <p className="morada-nota">Escolha um morador pelo retrato para dar ordens a ele.</p>
      </section>
    );
  }

  const itens = filaDe(estado, meuMoradorId);
  return (
    <section className="morada-painel morada-fila" aria-label={`Fila de ${morador.nome}`}>
      <h2>Fila de {morador.nome}</h2>
      {itens.length === 0 ? (
        <p className="morada-nota">Fila vazia. {morador.nome} decide por conta própria.</p>
      ) : (
        <ol>
          {itens.map((item, indice) => (
            <li
              key={item.acaoId}
              className="morada-etiqueta"
              data-atual={indice === 0 && item.situacao !== "na_fila" ? "sim" : undefined}
              data-pedida={item.pedida ? "sim" : undefined}
            >
              <span className="morada-etiqueta-texto">
                <b>{item.rotulo}</b>
                <small>
                  {SITUACOES[item.situacao]}
                  {item.pedida || item.emResposta ? "" : " · por conta própria"}
                </small>
              </span>
              {item.cancelavel ? (
                <button
                  type="button"
                  className="morada-botao-icone"
                  aria-label={`Cancelar: ${item.rotulo}`}
                  title="Cancelar"
                  onClick={() => {
                    void controle.sessao.comandar(meuMoradorId, {
                      t: "cancelar_acao",
                      acaoId: item.acaoId,
                    });
                  }}
                >
                  <Icone nome="fechar" tamanho={13} />
                </button>
              ) : null}
              {item.progresso !== null ? (
                <span
                  className="morada-progresso"
                  role="progressbar"
                  aria-label={`Andamento de ${item.rotulo}`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(item.progresso * 100)}
                >
                  <i style={{ width: `${Math.round(item.progresso * 100)}%` }} />
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
