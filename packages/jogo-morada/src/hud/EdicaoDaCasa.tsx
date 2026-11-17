import {
  conferirCompensacaoDaCasa,
  type EstadoDoMundo,
  listar,
  obter,
  perfilDePintura,
  temPermissao,
} from "@informach/morada-sim";
import { useState } from "react";
import { nomeDoObjeto } from "../modelo/menu";
import { nomeDoJogador } from "../modelo/retratos";
import type { Controle } from "./controle";
import { Icone } from "./Icone";

const moeda = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const dinheiro = (centavos: number) => `M$ ${moeda.format(centavos / 100)}`;
const medida = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

function DetalheDoHistorico({ controle, estado }: { controle: Controle; estado: EstadoDoMundo }) {
  const [conferido, conferir] = useState(false);
  const { editor } = controle,
    pedido = editor.rascunho;
  if (pedido?.operacao.t !== "compensar") return null;
  const op = pedido.operacao,
    autor = controle.sessao.loja.jogador?.jogadorId;
  const dados = autor
    ? conferirCompensacaoDaCasa(estado, autor, { ...pedido, operacao: op })
    : null;
  const previa = editor.prever();
  const peca = dados?.ok ? (dados.depois ?? dados.anterior) : null;
  const nome = peca ? nomeDoObjeto(peca.catalogo) : "Móvel";
  const acao = op.sentido === "desfazer" ? "Desfazer" : "Refazer";
  const valor = dados?.ok
    ? dados.delta > 0
      ? `Receber ${dinheiro(dados.delta)}`
      : dados.delta < 0
        ? `Pagar ${dinheiro(-dados.delta)}`
        : "Sem mudança no saldo"
    : "Confira novamente a mudança";
  return (
    <div className="morada-edicao-detalhe">
      <button
        type="button"
        className="morada-edicao-voltar"
        disabled={editor.confirmando}
        onClick={() => editor.cancelarSelecao()}
      >
        ← Cancelar histórico
      </button>
      <h3>
        {acao}: {nome}
      </h3>
      <p>
        {dados?.ok && !dados.depois
          ? "A peça será retirada da casa."
          : "A peça voltará às escolhas desta mudança."}
      </p>
      {peca ? (
        <output className="morada-edicao-posicao-atual" aria-label="Posição do histórico">
          {medida.format(peca.pos[0] / 1000)} × {medida.format(peca.pos[1] / 1000)} m · {peca.giro}°
        </output>
      ) : null}
      <p>
        <b>{valor}</b>
      </p>
      <p className="morada-nota">
        O valor vem da edição original. As outras mudanças da família continuam.
      </p>
      <label className="morada-edicao-consentimento">
        <input
          type="checkbox"
          checked={conferido}
          disabled={editor.confirmando}
          onChange={(e) => conferir(e.currentTarget.checked)}
        />
        Conferi a mudança e o valor
      </label>
      <p
        className="morada-edicao-validade"
        role="status"
        data-valida={previa.valido ? "sim" : "nao"}
      >
        {editor.confirmando
          ? "Esperando o servidor confirmar…"
          : (previa.motivo ?? "Prévia válida. Confirme para aplicar.")}
      </p>
      <button
        type="button"
        className="morada-botao morada-botao-forte morada-edicao-confirmar"
        disabled={editor.confirmando || !previa.valido || !conferido}
        onClick={() => {
          void editor.confirmar({ historicoConfirmado: conferido });
        }}
      >
        {editor.confirmando ? "Confirmando…" : `Confirmar ${op.sentido}`}
      </button>
      {!previa.valido ? (
        <button
          type="button"
          className="morada-botao"
          disabled={editor.confirmando}
          onClick={() => {
            conferir(false);
            editor.revisar();
          }}
        >
          Revisar histórico
        </button>
      ) : null}
    </div>
  );
}

function Detalhe(props: { controle: Controle; estado: EstadoDoMundo }) {
  const { controle, estado } = props,
    { editor } = controle;
  const [vendaConfirmada, confirmarVenda] = useState(false);
  const [compacto, definirCompacto] = useState(false);
  const pedido = editor.rascunho;
  if (!pedido) return null;
  const op = pedido.operacao;
  if (op.t === "compensar") return <DetalheDoHistorico controle={controle} estado={estado} />;
  const objeto = op.t !== "comprar" ? obter(estado.objetos, op.objetoId) : null;
  const catalogo = op.t === "comprar" ? op.catalogo : objeto?.catalogo;
  const oferta = estado.loja.ofertas.find((o) => o.catalogo === catalogo);
  const perfil = catalogo
    ? perfilDePintura(estado.catalogoDePinturas, {
        catalogo,
        versao: op.t === "comprar" ? op.versaoDoCatalogo : (objeto?.versao ?? 0),
      })
    : null;
  const colocacao = op.t === "comprar" || op.t === "mover" ? op.colocacao : null;
  const pintura = op.t === "comprar" || op.t === "pintar" ? op.pintura : null;
  const previa = editor.prever();
  const ocupado = editor.confirmando;
  const rotulo = oferta?.rotulo ?? (catalogo ? nomeDoObjeto(catalogo) : "Móvel");
  const texto =
    op.t === "comprar" && oferta
      ? `Comprar por ${dinheiro(oferta.compraCentavos)}`
      : op.t === "vender" && oferta
        ? `Vender por ${dinheiro(oferta.revendaCentavos)}`
        : op.t === "pintar"
          ? "Aplicar pintura"
          : "Confirmar posição";
  const valorDaCor = `#${(pintura?.cor ?? perfil?.referencia ?? 0xffffff).toString(16).padStart(6, "0")}`;
  return (
    <div className={`morada-edicao-detalhe ${compacto ? "morada-edicao-compacta" : ""}`}>
      <button
        type="button"
        className="morada-edicao-voltar"
        disabled={ocupado}
        onClick={() => editor.cancelarSelecao()}
      >
        ← Trocar seleção
      </button>
      <h3>{rotulo}</h3>
      {colocacao ? (
        <output className="morada-edicao-posicao-atual" aria-label="Posição da prévia">
          {medida.format(colocacao.pos[0] / 1000)} × {medida.format(colocacao.pos[1] / 1000)} m ·{" "}
          {colocacao.giro}°
        </output>
      ) : null}
      {op.t !== "vender" ? (
        <div className="morada-edicao-ver-casa">
          <button type="button" className="morada-botao" onClick={() => definirCompacto((v) => !v)}>
            {compacto ? "Ver opções do móvel" : "Ver prévia na casa"}
          </button>
          {compacto && colocacao ? (
            <button
              type="button"
              className="morada-botao"
              disabled={ocupado}
              onClick={() => editor.girar()}
            >
              Girar 90°
            </button>
          ) : null}
        </div>
      ) : null}
      {objeto ? (
        <fieldset className="morada-edicao-modos">
          <legend className="morada-so-leitor">O que fazer com o móvel</legend>
          {(["mover", "pintar", "vender"] as const).map((modo) => (
            <button
              type="button"
              key={modo}
              aria-pressed={op.t === modo}
              disabled={ocupado || (modo === "pintar" && !perfil)}
              onClick={() => editor.selecionar(objeto.id, modo)}
            >
              {modo === "mover" ? "Mover" : modo === "pintar" ? "Pintar" : "Vender"}
            </button>
          ))}
        </fieldset>
      ) : null}
      {colocacao ? (
        <fieldset className="morada-edicao-posicao" disabled={ocupado}>
          <legend>Posição na casa</legend>
          <p className="morada-nota">Toque no chão para posicionar. A grade tem 0,5 m.</p>
          <div className="morada-edicao-coordenadas">
            {([0, 1] as const).map((eixo) => (
              <label key={eixo}>
                {eixo === 0 ? "Largura (m)" : "Profundidade (m)"}
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={colocacao.pos[eixo] / 1000}
                  onChange={(e) => {
                    const n = e.currentTarget.valueAsNumber;
                    if (!Number.isFinite(n)) return;
                    editor.posicionarEixo(eixo, Math.round(n * 1000));
                  }}
                />
              </label>
            ))}
          </div>
          <button type="button" className="morada-botao" onClick={() => editor.girar()}>
            Girar 90° <kbd>R</kbd>
          </button>
          <output className="morada-edicao-orientacao" aria-label="Orientação do móvel">
            {colocacao.giro}°
          </output>
        </fieldset>
      ) : null}
      {(op.t === "comprar" || op.t === "pintar") && perfil ? (
        <fieldset className="morada-edicao-pintura" disabled={ocupado}>
          <legend>{perfil.rotulo}</legend>
          <div>
            <button
              type="button"
              className="morada-botao"
              aria-pressed={pintura === null}
              onClick={() => editor.pintar(null)}
            >
              Arte original
            </button>
            <label>
              Escolher cor
              <input
                type="color"
                aria-label="Cor do móvel"
                value={valorDaCor}
                onChange={(e) => editor.pintar(Number.parseInt(e.currentTarget.value.slice(1), 16))}
              />
            </label>
          </div>
          <p className="morada-nota">
            {pintura === null
              ? "A peça conserva as cores da arte original."
              : "Cor escolhida para a superfície indicada. Os detalhes permanecem."}
          </p>
        </fieldset>
      ) : null}
      {op.t === "vender" ? (
        <label className="morada-edicao-consentimento">
          <input
            type="checkbox"
            checked={vendaConfirmada}
            disabled={ocupado}
            onChange={(e) => confirmarVenda(e.currentTarget.checked)}
          />
          Retirar este móvel da casa e receber o valor de revenda.
        </label>
      ) : null}
      <p
        role="status"
        className={`morada-edicao-validade ${previa.valido ? "" : "morada-edicao-invalida"}`}
      >
        {ocupado
          ? "Esperando o servidor confirmar…"
          : (previa.motivo ??
            (op.t === "vender"
              ? "Confira o valor antes de vender."
              : "Prévia válida. A mudança só acontece ao confirmar."))}
      </p>
      <button
        type="button"
        className="morada-botao morada-botao-forte morada-edicao-confirmar"
        disabled={ocupado || !previa.valido || (op.t === "vender" && !vendaConfirmada)}
        onClick={() => {
          void editor.confirmar({ vendaConfirmada });
        }}
      >
        {ocupado ? "Confirmando…" : texto}
      </button>
      {!previa.valido ? (
        <button
          type="button"
          className="morada-botao"
          disabled={ocupado}
          onClick={() => editor.revisar()}
        >
          Revisar seleção
        </button>
      ) : null}
    </div>
  );
}

export function EdicaoDaCasa({ controle, estado }: { controle: Controle; estado: EstadoDoMundo }) {
  const { editor } = controle;
  const [aba, definirAba] = useState<"loja" | "casa">("loja");
  if (!editor.aberto) return null;
  const autor = controle.sessao.loja.jogador?.jogadorId;
  const familias = autor
    ? listar(estado.familias).filter(
        (f) => f.loteId && temPermissao(estado, autor, f.id, "decorar"),
      )
    : [];
  const familia = editor.familiaId ? obter(estado.familias, editor.familiaId) : null;
  const pedido = editor.rascunho;
  const chave = pedido
    ? pedido.operacao.t === "compensar"
      ? `${pedido.operacao.sentido}/${pedido.operacao.chave}/${pedido.operacao.revisaoDoPasso}`
      : `${pedido.operacao.t}/${pedido.operacao.t === "comprar" ? pedido.operacao.catalogo : `${pedido.operacao.objetoId}/${pedido.operacao.revisaoDoObjeto}`}`
    : "sem-selecção";
  const objetos = listar(estado.objetos).filter((o) => o.loteId === editor.loteId);
  const presenca = controle.sessao.loja.visao?.presenca;
  const outrasObras = (presenca?.obras ?? []).filter(
    (o) => o.perfilId !== autor && o.alvo.loteId === editor.loteId,
  );
  return (
    <section className="morada-painel morada-edicao" aria-label="Decoração da casa">
      <header className="morada-edicao-cabecalho">
        <div>
          <span className="morada-edicao-sobre">CASA & COMPANHIA</span>
          <h2>Decorar a casa</h2>
        </div>
        <button
          type="button"
          className="morada-botao-icone"
          aria-label="Fechar decoração"
          disabled={editor.confirmando}
          onClick={() => {
            editor.fechar();
            controle.focarNaCena();
          }}
        >
          <Icone nome="fechar" />
        </button>
      </header>
      <div className="morada-edicao-saldo">
        <span>{familia?.nome ?? "Família"}</span>
        <b>{familia ? dinheiro(familia.fundo) : "—"}</b>
      </div>
      <nav className="morada-edicao-historico" aria-label="Histórico das suas mudanças">
        {(["desfazer", "refazer"] as const).map((sentido) => {
          const passo = editor.proximoNoHistorico(sentido);
          return (
            <button
              key={sentido}
              type="button"
              className="morada-botao"
              disabled={editor.confirmando || !passo || passo.interferida}
              title={
                passo?.interferida
                  ? "Outra pessoa alterou esta peça."
                  : "Confira a prévia antes de confirmar."
              }
              onClick={() => editor.prepararHistorico(sentido)}
            >
              {sentido === "desfazer" ? "Desfazer" : "Refazer"}
            </button>
          );
        })}
      </nav>
      {presenca && outrasObras.length > 0 ? (
        <aside className="morada-edicao-obras" aria-label="Outras pessoas decorando">
          <p>As áreas em amarelo estão sendo editadas:</p>
          <ul>
            {outrasObras.map((obra) => {
              const peca = obra.alvo.peca ? obter(estado.objetos, obra.alvo.peca.id) : null;
              return (
                <li key={`${obra.referencia.geracao}/${obra.referencia.numero}`}>
                  <b>{nomeDoJogador(presenca, obra.perfilId, { jogadorId: autor ?? "" })}</b>
                  {peca ? ` · ${nomeDoObjeto(peca.catalogo)}` : " · posição de uma peça"}
                </li>
              );
            })}
          </ul>
        </aside>
      ) : null}
      {familias.length > 1 ? (
        <label className="morada-edicao-familia">
          Casa da família
          <select
            value={editor.familiaId ?? ""}
            disabled={editor.confirmando}
            onChange={(e) => {
              const f = familias.find((f) => f.id === e.currentTarget.value);
              if (f) editor.abrir(f.id);
            }}
          >
            {familias.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {pedido ? (
        <Detalhe key={chave} controle={controle} estado={estado} />
      ) : (
        <>
          <nav className="morada-edicao-abas" aria-label="Escolher móveis">
            <button type="button" aria-pressed={aba === "loja"} onClick={() => definirAba("loja")}>
              Loja
            </button>
            <button type="button" aria-pressed={aba === "casa"} onClick={() => definirAba("casa")}>
              Na casa <span>{objetos.length}</span>
            </button>
          </nav>
          <p className="morada-nota">
            {aba === "loja"
              ? "Escolha uma peça para experimentar na casa."
              : "Selecione na lista ou toque num móvel da casa."}
          </p>
          <ul className="morada-edicao-catalogo">
            {aba === "loja"
              ? estado.loja.ofertas.map((oferta) => (
                  <li key={oferta.catalogo}>
                    <button type="button" onClick={() => editor.comprar(oferta.catalogo)}>
                      <Icone nome="decorar" tamanho={24} />
                      <b>{oferta.rotulo}</b>
                      <span>{dinheiro(oferta.compraCentavos)}</span>
                    </button>
                  </li>
                ))
              : objetos.map((objeto, indice) => (
                  <li key={objeto.id}>
                    <button type="button" onClick={() => editor.selecionar(objeto.id)}>
                      <Icone nome="decorar" tamanho={24} />
                      <b>
                        {estado.loja.ofertas.find((o) => o.catalogo === objeto.catalogo)?.rotulo ??
                          nomeDoObjeto(objeto.catalogo)}
                      </b>
                      <span>Peça {indice + 1}</span>
                    </button>
                  </li>
                ))}
          </ul>
        </>
      )}
      {editor.mensagem ? (
        <p className="morada-edicao-aviso" role="status">
          {editor.mensagem}
        </p>
      ) : null}
      <p className="morada-edicao-ajuda">
        <kbd>R</kbd> girar · <kbd>Enter</kbd> confirmar · <kbd>Esc</kbd> voltar
        <br />
        M$ é o dinheiro do mundo do Morada.
      </p>
    </section>
  );
}
