"use client";

import { useEffect, useRef } from "react";
import type { OpcoesDoMorada } from "./fonte";
import { montarMorada } from "./index";

/**
 * Casca React do jogo: monta ao aparecer e solta ao sumir. As opções valem as
 * da primeira montagem; trocar de mundo é trocar a `key`.
 *
 * Quem usa dá o tamanho pelo `className`. Sem ele, o elemento ocupa o pai
 * inteiro. O tamanho padrão é posto pelo DOM, e não como atributo `style` no
 * HTML, para a página poder ter uma CSP sem estilo embutido.
 */
export function MoradaJogo(props: OpcoesDoMorada & { className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const opcoes = useRef(props);
  opcoes.current = props;

  useEffect(() => {
    const elemento = host.current;
    if (!elemento) return;
    const atuais = opcoes.current;
    if (!atuais.className) {
      elemento.style.width = "100%";
      elemento.style.height = "100%";
    }
    const jogo = montarMorada(elemento, {
      fonte: atuais.fonte,
      origemDaArte: atuais.origemDaArte,
      depurar: atuais.depurar,
      // Lidas na hora de usar: a página pode trocar as funções sem remontar o jogo.
      aoSair: atuais.aoSair ? () => opcoes.current.aoSair?.() : undefined,
      aoEntrar: () => opcoes.current.aoEntrar?.(),
      aoEncerrar: (motivo, detalhe) => opcoes.current.aoEncerrar?.(motivo, detalhe),
    });
    return () => {
      void jogo.dispose();
    };
  }, []);

  return <div ref={host} className={props.className} />;
}
