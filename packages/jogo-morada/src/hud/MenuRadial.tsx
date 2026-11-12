import type { EstadoDoMundo } from "@informach/morada-sim";
import { type KeyboardEvent, useEffect, useRef } from "react";
import type { MenuAberto } from "../espelho/loja";
import { menuDoAlvo, type OpcaoDoMenu } from "../modelo/menu";
import type { Controle } from "./controle";
import { Icone } from "./Icone";

/**
 * O menu em leque que abre onde a pessoa clicou: o que dá para fazer com
 * aquele móvel ou morador. Cada opção desligada diz por quê. Escolher manda o
 * pedido; quem decide é o servidor.
 */

const RAIO = 92;
const PASSO = 50;
const MARGEM = 12;
const LARGURA_DA_OPCAO = 196;

export type LugarNoLeque = { x: number; y: number; lado: "direita" | "esquerda" };

/**
 * Onde cada opção fica em volta do centro: metade à direita, metade à
 * esquerda, cada lado em uma coluna que acompanha o arco de um círculo.
 */
export function leque(total: number): LugarNoLeque[] {
  const direita = Math.ceil(total / 2);
  const lugares: LugarNoLeque[] = [];
  for (let i = 0; i < total; i++) {
    const naDireita = i < direita;
    const quantos = naDireita ? direita : total - direita;
    const indice = naDireita ? i : i - direita;
    const y = (indice - (quantos - 1) / 2) * PASSO;
    // Quem está mais longe do meio da coluna fica mais perto do eixo, como em um arco.
    const x = Math.sqrt(Math.max(RAIO * RAIO - Math.min(y * y, RAIO * RAIO * 0.75), 0));
    lugares.push({ x: naDireita ? x : -x, y, lado: naDireita ? "direita" : "esquerda" });
  }
  return lugares;
}

/** Mantém o leque inteiro dentro da área do jogo. */
export function ancorar(
  menu: { x: number; y: number },
  total: number,
  area: { largura: number; altura: number },
): { x: number; y: number } {
  const meiaLargura = RAIO + LARGURA_DA_OPCAO + MARGEM;
  const meiaAltura = Math.max(60, (Math.ceil(total / 2) * PASSO) / 2 + 28) + MARGEM;
  const limitar = (valor: number, meia: number, tamanho: number) =>
    // Em uma área menor que o leque, o melhor que dá é centralizar.
    tamanho < meia * 2 ? tamanho / 2 : Math.min(tamanho - meia, Math.max(meia, valor));
  return {
    x: limitar(menu.x, meiaLargura, area.largura),
    y: limitar(menu.y, meiaAltura, area.altura),
  };
}

export function MenuRadial(props: {
  controle: Controle;
  estado: EstadoDoMundo;
  aberto: MenuAberto;
  jogadorId: string;
  area: { largura: number; altura: number };
}) {
  const { controle, estado, aberto, jogadorId, area } = props;
  const { sessao } = controle;
  const raiz = useRef<HTMLDivElement>(null);
  const menu = menuDoAlvo(estado, aberto.alvo, {
    jogadorId,
    meuMoradorId: sessao.loja.meuMoradorId(),
  });

  const fechar = () => {
    sessao.loja.abrirMenu(null);
    controle.focarNaCena();
  };

  // Ao abrir, o foco vai para a primeira opção que dá para escolher. Quem usa
  // este componente troca a `key` a cada alvo, então isto roda uma vez por menu.
  useEffect(() => {
    const opcoes = raiz.current?.querySelectorAll<HTMLButtonElement>("[role='menuitem']");
    const primeira =
      [...(opcoes ?? [])].find((botao) => botao.getAttribute("aria-disabled") !== "true") ??
      raiz.current?.querySelector<HTMLButtonElement>(".morada-menu-centro button");
    primeira?.focus();
  }, []);

  // O alvo sumiu do mundo enquanto o menu estava aberto.
  useEffect(() => {
    if (!menu) sessao.loja.abrirMenu(null);
  }, [menu, sessao]);
  if (!menu) return null;

  const lugares = leque(menu.opcoes.length);
  const centro = ancorar(aberto, menu.opcoes.length, area);

  const escolher = (opcao: OpcaoDoMenu) => {
    if (!opcao.habilitada) return;
    void sessao.comandar(opcao.moradorId, opcao.acao);
    fechar();
  };

  const aoTeclar = (evento: KeyboardEvent<HTMLDivElement>) => {
    if (evento.key === "Escape") {
      evento.stopPropagation();
      fechar();
      return;
    }
    if (evento.key !== "ArrowDown" && evento.key !== "ArrowUp") return;
    const botoes = [
      ...(raiz.current?.querySelectorAll<HTMLButtonElement>("[role='menuitem']") ?? []),
    ];
    if (botoes.length === 0) return;
    evento.preventDefault();
    const comFoco = document.activeElement;
    const atual = comFoco instanceof HTMLButtonElement ? botoes.indexOf(comFoco) : -1;
    const passo = evento.key === "ArrowDown" ? 1 : -1;
    botoes[(atual + passo + botoes.length) % botoes.length]?.focus();
  };

  return (
    <div
      ref={raiz}
      className="morada-menu"
      role="menu"
      aria-label={menu.titulo}
      style={{ left: centro.x, top: centro.y }}
      onKeyDown={aoTeclar}
    >
      <div className="morada-menu-centro">
        <strong>{menu.titulo}</strong>
        {menu.opcoes.length === 0 ? <span>{menu.vazio}</span> : null}
        <button
          type="button"
          className="morada-botao-icone"
          aria-label="Fechar o menu"
          onClick={fechar}
        >
          <Icone nome="fechar" tamanho={12} />
        </button>
      </div>
      {menu.opcoes.map((opcao, indice) => {
        const lugar = lugares[indice];
        if (!lugar) return null;
        return (
          <button
            key={opcao.id}
            type="button"
            role="menuitem"
            className="morada-opcao"
            data-lado={lugar.lado}
            data-opcao={opcao.id}
            aria-disabled={opcao.habilitada ? undefined : "true"}
            style={{ left: lugar.x, top: lugar.y }}
            onClick={() => escolher(opcao)}
          >
            <b>{opcao.rotulo}</b>
            {opcao.motivo ? <small>{opcao.motivo}</small> : null}
          </button>
        );
      })}
    </div>
  );
}
