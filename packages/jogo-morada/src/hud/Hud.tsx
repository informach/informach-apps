import { obter } from "@informach/morada-sim";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { familiasDoJogador, resumoDaPresenca } from "../modelo/retratos";
import { Avisos } from "./Avisos";
import { Carga } from "./Carga";
import { type Controle, quemSou } from "./controle";
import { Fila } from "./Fila";
import { MenuRadial } from "./MenuRadial";
import { Painel } from "./Painel";
import { Pedidos } from "./Pedidos";
import { Relogio } from "./Relogio";
import { Retratos } from "./Retratos";
import { Trilho } from "./Trilho";

/**
 * O HUD inteiro. Ele emoldura o mundo: relógio e presença em cima, o trilho de
 * ferramentas na lateral, e embaixo o morador, os retratos e a fila. O meio da
 * tela é da casa.
 *
 * Redesenha quando o espelho muda e, quatro vezes por segundo, para o relógio
 * e as barras de andamento, que dependem do tick estimado e não de mensagem.
 */

const BATIDA_MS = 250;

export function Hud({ controle }: { controle: Controle }) {
  const { sessao } = controle;
  const { loja } = sessao;
  useSyncExternalStore(loja.subscribe, loja.getSnapshot, loja.getSnapshot);

  const [, bater] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      loja.limparAvisos();
      bater((n) => n + 1);
    }, BATIDA_MS);
    return () => clearInterval(id);
  }, [loja]);

  // O tamanho da área do jogo, para o menu em leque caber dentro dela.
  const raiz = useRef<HTMLDivElement>(null);
  const [area, definirArea] = useState({ largura: 1280, altura: 720 });
  useEffect(() => {
    const elemento = raiz.current;
    if (!elemento) return;
    const observador = new ResizeObserver(() => {
      definirArea({ largura: elemento.clientWidth, altura: elemento.clientHeight });
    });
    observador.observe(elemento);
    return () => observador.disconnect();
  }, []);

  const estado = sessao.estado();
  const visao = loja.visao;
  const eu = quemSou(controle);
  const carga = (
    <Carga
      conexao={loja.conexao}
      temMundo={visao !== null}
      contextoPerdido={loja.contextoPerdido}
      aoVoltar={controle.voltar}
    />
  );

  if (!estado || !visao || !eu) {
    return (
      <div ref={raiz} className="morada-hud">
        <Avisos loja={loja} avisos={loja.avisos} />
        {carga}
      </div>
    );
  }

  const presenca = visao.presenca;
  const meuMoradorId = loja.meuMoradorId();
  // Quem a pessoa dirige vem primeiro; sem dirigir ninguém, vale o último retrato tocado.
  const focoId = meuMoradorId ?? loja.selecionadoId;
  const emFoco = focoId ? obter(estado.moradores, focoId) : undefined;
  const resumo = resumoDaPresenca(presenca, eu.jogadorId);
  const familia = familiasDoJogador(estado, eu.jogadorId)
    .map((id) => obter(estado.familias, id)?.nome)
    .find((nome) => nome !== undefined);
  const encerrado = loja.conexao.fase === "encerrado";

  return (
    <div ref={raiz} className="morada-hud" data-encerrado={encerrado ? "sim" : undefined}>
      <div className="morada-topo">
        <Relogio controle={controle} estado={estado} presenca={presenca} eu={eu} />
        <div className="morada-presenca" role="status">
          {familia ? <b>Família {familia}</b> : null}
          <span>{resumo.texto}</span>
        </div>
        <Avisos loja={loja} avisos={loja.avisos} />
      </div>

      <Trilho controle={controle} estado={estado} meuMoradorId={meuMoradorId} />

      <div className="morada-base">
        {emFoco ? <Painel estado={estado} morador={emFoco} /> : <span />}
        <Retratos controle={controle} estado={estado} presenca={presenca} eu={eu} />
        <div className="morada-coluna">
          <Pedidos
            controle={controle}
            estado={estado}
            presenca={presenca}
            jogadorId={eu.jogadorId}
          />
          <Fila controle={controle} estado={estado} meuMoradorId={meuMoradorId} />
        </div>
      </div>

      {loja.menu ? (
        <MenuRadial
          key={JSON.stringify(loja.menu.alvo)}
          controle={controle}
          estado={estado}
          aberto={loja.menu}
          jogadorId={eu.jogadorId}
          area={area}
        />
      ) : null}
      {carga}
    </div>
  );
}
