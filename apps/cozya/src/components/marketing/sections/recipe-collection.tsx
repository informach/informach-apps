import { ArrowRight, Camera, Check, FileText, Mic, Sparkles } from "lucide-react";

export function RecipeCollection() {
  return (
    <section
      id="recursos"
      className="landing-shell landing-section collection-section"
      aria-labelledby="collection-title"
    >
      <div className="collection-copy">
        <p className="landing-eyebrow">O seu caderno, sempre à mão</p>
        <h2 className="landing-title" id="collection-title">
          Suas receitas favoritas, prontas para entrar na semana.
        </h2>
        <p className="landing-description">
          A receita do caderno, o print guardado no celular, aquele preparo que você sabe de cabeça.
          Reúna tudo no Cozya para encontrar, planejar e cozinhar de novo.
        </p>
        <ul className="capture-methods" aria-label="Formas de guardar uma receita">
          <li>
            <Camera size={17} aria-hidden /> Foto
          </li>
          <li>
            <FileText size={17} aria-hidden /> Texto
          </li>
          <li>
            <Mic size={17} aria-hidden /> Voz
          </li>
        </ul>
        <p className="collection-ai-note">
          <Sparkles size={18} aria-hidden />
          <span>
            A IA ajuda a organizar, pesquisar e adaptar. Você revisa antes de salvar e também pode
            cadastrar tudo manualmente.
          </span>
        </p>
      </div>
      <figure className="collection-example">
        <figcaption className="landing-mini-label">EXEMPLO DE ORGANIZAÇÃO POR TEXTO</figcaption>
        <div className="collection-note">
          <span>Uma receita de casa</span>
          <p>Omelete de abobrinha</p>
          <blockquote>
            4 ovos, uma abobrinha pequena ralada, uma colher de sopa de azeite e sal a gosto.
            Esprema a abobrinha, misture com os ovos e cozinhe na frigideira...
          </blockquote>
          <span className="collection-note-footer">Texto colado no Cozya</span>
        </div>
        <span className="collection-arrow" aria-hidden>
          <ArrowRight size={22} />
        </span>
        <div className="collection-recipe">
          <div className="collection-recipe-top">
            <span className="collection-recipe-icon">
              <FileText size={22} aria-hidden />
            </span>
            <span>RECEITA ORGANIZADA</span>
          </div>
          <h3>
            Omelete
            <br />
            de abobrinha
          </h3>
          <p className="collection-yield">Rendimento: 2 porções</p>
          <ul>
            <li>
              <Check size={15} aria-hidden /> Ingredientes separados
            </li>
            <li>
              <Check size={15} aria-hidden /> Preparo em etapas
            </li>
            <li>
              <Check size={15} aria-hidden /> Pronta para você revisar
            </li>
          </ul>
          <div className="collection-review">
            <Check size={16} aria-hidden /> Revisar e salvar
          </div>
        </div>
      </figure>
    </section>
  );
}
