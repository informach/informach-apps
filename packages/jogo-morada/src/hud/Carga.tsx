import { textoDaReabertura, textoDoFim } from "../modelo/textos";
import type { EstadoDaConexao } from "../rede/conexao";

/**
 * Os estados da conexão que a pessoa precisa ver: a entrada no mundo, passo a
 * passo; a volta depois de uma queda, sem tirar o jogo da frente; e o fim, com
 * o motivo dito em palavras.
 */

const PASSOS = [
  { fase: "conectando", texto: "Achando o mundo" },
  { fase: "entrando", texto: "Entrando com a sua sessão" },
  { fase: "montando", texto: "Montando a casa" },
] as const;

export function Carga(props: {
  conexao: EstadoDaConexao;
  /** O jogo já mostrou o mundo alguma vez: uma queda vira faixa, não tela cheia. */
  temMundo: boolean;
  contextoPerdido: boolean;
  aoVoltar: (() => void) | null;
  /** Sair do jogo antes de o mundo aparecer; `null` se quem hospeda não tem para onde voltar. */
  aoDesistir: (() => void) | null;
}) {
  const { conexao, temMundo, contextoPerdido, aoVoltar, aoDesistir } = props;
  // Sem o mundo na tela não há trilho de ferramentas: a saída fica no próprio cartão.
  const sair = aoDesistir ? (
    <button type="button" className="morada-botao" onClick={aoDesistir}>
      Sair
    </button>
  ) : null;

  if (conexao.fase === "encerrado") {
    // Quem saiu por vontade própria já está indo embora: não há o que explicar.
    if (conexao.motivo === "saiu" && aoVoltar) return null;
    const fim = textoDoFim(conexao.motivo);
    return (
      <div className="morada-veu" role="alertdialog" aria-labelledby="morada-fim-titulo">
        <div className="morada-cartao">
          <h2 id="morada-fim-titulo">{fim.titulo}</h2>
          <p>{fim.texto}</p>
          {aoVoltar ? (
            <button type="button" className="morada-botao morada-botao-forte" onClick={aoVoltar}>
              Voltar
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  if (conexao.fase === "reconectando") {
    const texto = `${textoDaReabertura(conexao.motivo)}${conexao.tentativa > 1 ? ` (tentativa ${conexao.tentativa})` : ""}.`;
    if (temMundo) {
      return (
        <div className="morada-faixa" role="status">
          <span className="morada-pulso" aria-hidden="true" />
          {texto}
        </div>
      );
    }
    return (
      <div className="morada-veu" role="status">
        <div className="morada-cartao">
          <h2>Morada</h2>
          <p>{texto}</p>
          {sair}
        </div>
      </div>
    );
  }

  if (conexao.fase !== "pronto") {
    const atual = PASSOS.findIndex((passo) => passo.fase === conexao.fase);
    return (
      <div className="morada-veu" role="status" aria-live="polite">
        <div className="morada-cartao">
          <h2>Morada</h2>
          <ol className="morada-passos">
            {PASSOS.map((passo, indice) => (
              <li
                key={passo.fase}
                data-estado={indice < atual ? "feito" : indice === atual ? "agora" : "depois"}
                aria-current={indice === atual ? "step" : undefined}
              >
                {passo.texto}
              </li>
            ))}
          </ol>
          {sair}
        </div>
      </div>
    );
  }

  if (contextoPerdido) {
    return (
      <div className="morada-veu morada-veu-leve" role="status">
        <div className="morada-cartao">
          <h2>A imagem do jogo parou</h2>
          <p>
            O navegador interrompeu o desenho. O mundo continua rodando e a cena volta sozinha em
            instantes.
          </p>
        </div>
      </div>
    );
  }

  return null;
}
