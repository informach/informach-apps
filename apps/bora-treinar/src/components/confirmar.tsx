"use client";
import { type ReactNode, useCallback, useRef, useState } from "react";

interface Pedido {
  titulo: string;
  texto?: string;
  confirmar: string;
  perigo?: boolean;
}

/**
 * Pergunta de confirmação no visual do app. `window.confirm` funciona mal no navegador da TV
 * (às vezes nem aparece, e o controle remoto não alcança) e foge do visual. O foco vai para
 * "Cancelar", a opção segura; `data-modal` prende a navegação por setas dentro da pergunta.
 */
export function useConfirmar(): [ReactNode, (pedido: Pedido) => Promise<boolean>] {
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const resposta = useRef<(sim: boolean) => void>(() => undefined);
  const confirmar = useCallback(
    (p: Pedido) =>
      new Promise<boolean>((resolve) => {
        resposta.current = resolve;
        setPedido(p);
      }),
    [],
  );
  const fechar = (sim: boolean) => {
    setPedido(null);
    resposta.current(sim);
  };
  const elemento = pedido ? (
    <div
      className="overlay-msg fixed"
      data-modal
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirmar-titulo"
    >
      <div>
        <h2 id="confirmar-titulo">{pedido.titulo}</h2>
        {pedido.texto && <p className="muted">{pedido.texto}</p>}
        <button
          type="button"
          className="btn big"
          // biome-ignore lint/a11y/noAutofocus: no controle da TV o foco precisa cair na opção segura
          autoFocus
          onClick={() => fechar(false)}
        >
          Cancelar
        </button>
        <button
          type="button"
          className={`btn ${pedido.perigo ? "danger" : "primary"}`}
          onClick={() => fechar(true)}
        >
          {pedido.confirmar}
        </button>
      </div>
    </div>
  ) : null;
  return [elemento, confirmar];
}
