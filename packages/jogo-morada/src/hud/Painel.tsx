import type { EstadoDoMundo, Morador } from "@informach/morada-sim";
import { humorDe, necessidadesDe } from "../modelo/painel";
import { rotuloDaFase, rotuloDoHumor } from "../modelo/textos";
import { Rosto } from "./Retratos";

/**
 * O morador em foco: quem é, como está o humor e as necessidades, em barras
 * pequenas. Uma barra abaixo do nível crítico muda de cor e de rótulo: a cor
 * nunca é o único sinal.
 */
export function Painel({ estado, morador }: { estado: EstadoDoMundo; morador: Morador }) {
  const necessidades = necessidadesDe(morador);
  const humor = humorDe(morador, estado.relogio.tick);
  return (
    <section className="morada-painel morada-morador" aria-label={`Como está ${morador.nome}`}>
      <header>
        <span className="morada-moldura morada-moldura-pequena">
          <Rosto pele={morador.aparencia.pele} fase={morador.fase} />
        </span>
        <div>
          <h2>{morador.nome}</h2>
          <p className="morada-nota">{rotuloDaFase(morador)}</p>
        </div>
        <span className="morada-humor" data-humor={humor.humor}>
          {rotuloDoHumor(humor.humor)}
        </span>
      </header>
      {necessidades.length > 0 ? (
        <ul className="morada-necessidades">
          {necessidades.map((necessidade) => (
            <li key={necessidade.id} data-critica={necessidade.critica ? "sim" : undefined}>
              <span>
                {necessidade.rotulo}
                {necessidade.critica ? <em> baixa</em> : null}
              </span>
              <span className="morada-barra" aria-hidden="true">
                <i style={{ width: `${Math.round(necessidade.nivel * 100)}%` }} />
              </span>
              <span className="morada-so-leitor">{Math.round(necessidade.nivel * 100)}%</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="morada-nota">Está fora de casa.</p>
      )}
      {humor.sensacoes.length > 0 ? (
        <p className="morada-sensacoes">{humor.sensacoes.join(" · ")}</p>
      ) : null}
    </section>
  );
}
