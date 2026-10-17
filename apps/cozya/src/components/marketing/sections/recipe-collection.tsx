import { ArrowRight } from "lucide-react";

export function RecipeCollection() {
  return (
    <section id="receitas" className="collection-section" aria-labelledby="collection-title">
      <div className="landing-shell landing-section collection-grid">
        <div className="collection-copy">
          <p className="landing-eyebrow">Do caderno para a semana</p>
          <h2 className="landing-title" id="collection-title">
            A receita da vó também entra na semana.
          </h2>
          <p className="landing-description">
            A receita do caderno, o print guardado, o bolo que você sabe de cabeça. Tire uma foto,
            cole o texto ou conte em voz alta. A IA organiza, você confere e guarda.
          </p>
          <p className="collection-promise">
            Quando o caderno não diz quantas porções rende, o Cozya pergunta em vez de inventar.
          </p>
          <ul className="capture-methods" aria-label="Jeitos de trazer uma receita">
            <li>Foto</li>
            <li>Texto colado</li>
            <li>Voz</li>
            <li>Pedir para a IA encontrar</li>
            <li className="capture-free">Escrever do seu jeito, sem crédito</li>
          </ul>
        </div>
        <figure className="collection-example">
          <figcaption className="sr-only">
            Exemplo: a foto de uma receita escrita à mão vira uma receita organizada para conferir.
          </figcaption>
          <div className="collection-note" aria-hidden>
            <span className="collection-note-label">Foto do caderno</span>
            <p>
              Bolo de cenoura da Tia Lurdes
              <br />3 cenouras, 3 ovos, 1 xíc. de óleo, 2 xíc. de açúcar, 2 de farinha, 1 colher de
              fermento. Bater no liquidificador... forno médio 40 min.
            </p>
          </div>
          <span className="collection-arrow" aria-hidden>
            <ArrowRight size={26} />
          </span>
          <div className="collection-recipe" aria-hidden>
            <span className="landing-mini-label">CONFIRA ANTES DE GUARDAR</span>
            <p className="collection-recipe-name">Bolo de cenoura da Tia Lurdes</p>
            <p className="collection-recipe-meta">6 ingredientes · 4 passos · 40 min</p>
            <div className="collection-question">
              <p>O caderno não diz quantas porções rende. Quantas são?</p>
              <div>
                <span>8</span>
                <span className="selected">12</span>
                <span>16</span>
                <span>Outro</span>
              </div>
            </div>
            <span className="collection-save">Guardar receita</span>
          </div>
        </figure>
      </div>
    </section>
  );
}
