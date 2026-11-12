import { type EstadoDoMundo, type MoradorId, obter } from "@informach/morada-sim";
import { useState } from "react";
import { type Vizinho, vizinhosDe } from "../modelo/retratos";
import type { Controle } from "./controle";
import { Icone } from "./Icone";
import { Rosto } from "./Retratos";

/**
 * O trilho de ferramentas da cena: paredes, câmera, o bairro e a saída. Fica
 * na lateral para emoldurar o mundo sem cobrir a casa.
 */

function Bairro(props: {
  controle: Controle;
  estado: EstadoDoMundo;
  meuMoradorId: MoradorId | null;
  aoFechar(): void;
}) {
  const { controle, estado, meuMoradorId, aoFechar } = props;
  const vizinhos = vizinhosDe(estado);
  const convidar = (vizinho: Vizinho) => {
    const { loja } = controle.sessao;
    if (!meuMoradorId) {
      loja.avisar("info", "Escolha um morador pelo retrato primeiro.");
      return;
    }
    void controle.sessao
      .comandar(meuMoradorId, { t: "convidar_visita", alvoId: vizinho.moradorId })
      .then((resposta) => {
        if (resposta.ok) loja.avisar("info", `${vizinho.nome} aceitou o convite e já vem.`);
      });
  };
  const anfitriao = meuMoradorId ? obter(estado.moradores, meuMoradorId) : undefined;

  return (
    <section className="morada-painel morada-bairro" aria-label="Moradores do bairro">
      <header>
        <h2>Bairro</h2>
        <button
          type="button"
          className="morada-botao-icone"
          aria-label="Fechar o bairro"
          onClick={aoFechar}
        >
          <Icone nome="fechar" tamanho={12} />
        </button>
      </header>
      {vizinhos.length === 0 ? (
        <p className="morada-nota">Ninguém mais mora por aqui ainda.</p>
      ) : (
        <ul>
          {vizinhos.map((vizinho) => (
            <li key={vizinho.moradorId}>
              <span className="morada-moldura morada-moldura-pequena">
                <Rosto pele={vizinho.pele} fase="adulto" />
              </span>
              <span className="morada-bairro-nome">
                <b>{vizinho.nome}</b>
                <small>{vizinho.deVisita ? "de visita na casa" : vizinho.rotuloDaFase}</small>
              </span>
              {vizinho.deVisita ? null : (
                <button
                  type="button"
                  className="morada-botao"
                  aria-disabled={anfitriao ? undefined : "true"}
                  title={anfitriao ? undefined : "Escolha um morador pelo retrato primeiro."}
                  onClick={() => convidar(vizinho)}
                >
                  Convidar
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="morada-nota">
        {anfitriao
          ? `Quem convida é ${anfitriao.nome}. A visita chega em instantes.`
          : "Escolha um morador pelo retrato para ele fazer o convite."}
      </p>
    </section>
  );
}

export function Trilho(props: {
  controle: Controle;
  estado: EstadoDoMundo;
  meuMoradorId: MoradorId | null;
}) {
  const { controle, estado, meuMoradorId } = props;
  const [bairroAberto, abrirBairro] = useState(false);
  const baixas = controle.sessao.loja.paredesBaixas;

  return (
    <>
      <nav className="morada-painel morada-trilho" aria-label="Ferramentas da cena">
        <button
          type="button"
          aria-pressed={baixas}
          title={baixas ? "Levantar as paredes" : "Baixar as paredes"}
          onClick={controle.alternarParedes}
        >
          <Icone nome="paredes" />
          <span>{baixas ? "Paredes baixas" : "Paredes altas"}</span>
        </button>
        <button
          type="button"
          aria-disabled={meuMoradorId ? undefined : "true"}
          title={meuMoradorId ? "Levar a câmera ao seu morador" : "Você não dirige ninguém agora"}
          onClick={controle.focarNoMeu}
        >
          <Icone nome="mira" />
          <span>Meu morador</span>
        </button>
        <button
          type="button"
          aria-expanded={bairroAberto}
          onClick={() => abrirBairro((aberto) => !aberto)}
        >
          <Icone nome="bairro" />
          <span>Bairro</span>
        </button>
        <button type="button" onClick={controle.sair}>
          <Icone nome="sair" />
          <span>Sair</span>
        </button>
      </nav>
      {bairroAberto ? (
        <Bairro
          controle={controle}
          estado={estado}
          meuMoradorId={meuMoradorId}
          aoFechar={() => abrirBairro(false)}
        />
      ) : null}
    </>
  );
}
