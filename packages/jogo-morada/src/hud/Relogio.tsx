import type { EstadoDoMundo, PresencaVista, Velocidade } from "@informach/morada-sim";
import { horaDoJogo, rotuloDaVelocidade, votoPendente } from "../modelo/painel";
import { enumerar, type OpcoesDosRetratos } from "../modelo/retratos";
import type { Controle } from "./controle";
import { Icone } from "./Icone";

/**
 * O relógio do jogo e o ritmo do mundo. Sozinha, a pessoa pausa e acelera na
 * hora; com mais gente no mundo, o botão vira um pedido que espera o acordo
 * de todos. Voltar a 1× nunca precisa de acordo.
 */

const VELOCIDADES: Velocidade[] = [0, 1, 2, 3];

export function Relogio(props: {
  controle: Controle;
  estado: EstadoDoMundo;
  presenca: PresencaVista;
  eu: OpcoesDosRetratos;
}) {
  const { controle, estado, presenca, eu } = props;
  const agora = horaDoJogo(estado);
  const atual = estado.relogio.velocidade;
  const voto = votoPendente(presenca, eu);
  const acompanhado = presenca.jogadores.some(
    (jogador) => jogador.perfilId !== eu.jogadorId && jogador.estado === "presente",
  );
  const votar = (velocidade: Velocidade) => {
    void controle.sessao.comandar(null, { t: "votar_velocidade", velocidade });
  };

  return (
    <section className="morada-painel morada-relogio" aria-label="Relógio do jogo">
      <div className="morada-hora">
        <strong>{agora.hora}</strong>
        <span>
          {agora.diaDaSemana}
          <br />
          dia {agora.dia}
        </span>
      </div>
      <fieldset className="morada-ritmo">
        <legend className="morada-so-leitor">Ritmo do mundo</legend>
        {VELOCIDADES.map((velocidade) => (
          <button
            key={velocidade}
            type="button"
            aria-pressed={atual === velocidade}
            data-pedido={voto?.velocidade === velocidade ? "sim" : undefined}
            aria-label={velocidade === 0 ? "Pausar" : `Velocidade ${velocidade} vezes`}
            onClick={() => votar(velocidade)}
          >
            {velocidade === 0 ? <Icone nome="pausa" tamanho={14} /> : `${velocidade}×`}
          </button>
        ))}
      </fieldset>
      {voto ? (
        <div className="morada-voto" role="status">
          <p>
            Pedido de {rotuloDaVelocidade(voto.velocidade)}.{" "}
            {voto.faltam.length > 0 ? `Falta ${enumerar(voto.faltam)} concordar.` : ""}
          </p>
          <div>
            {voto.euConcordei ? null : (
              <button type="button" onClick={() => votar(voto.velocidade)}>
                Concordar
              </button>
            )}
            <button type="button" onClick={() => votar(1)}>
              {voto.euConcordei ? "Desistir" : atual === 1 ? "Manter 1×" : "Voltar a 1×"}
            </button>
          </div>
        </div>
      ) : acompanhado ? (
        <p className="morada-nota">Com mais gente no mundo, pausar ou acelerar vira um pedido.</p>
      ) : null}
    </section>
  );
}
