"use client";

import { cn } from "@informach/ui/lib/utils";
import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * Escolha de tema.
 *
 * A preferência vive no navegador, não no perfil. É informação de aparelho —
 * a mesma criança estuda de dia no computador e de noite no celular — e manter
 * fora do servidor é um dado a menos guardado sobre uma criança, o que combina
 * com a política do produto.
 *
 * "Do sistema" é o padrão e não grava nada: sem escolha explícita, o CSS
 * responde a `prefers-color-scheme` sozinho, inclusive com JavaScript
 * desligado.
 */

export const CHAVE_TEMA = "ms-tema";

type Escolha = "sistema" | "claro" | "escuro";

const opcoes: { valor: Escolha; rotulo: string; Icone: typeof Sun }[] = [
  { valor: "claro", rotulo: "Claro", Icone: Sun },
  { valor: "escuro", rotulo: "Escuro", Icone: Moon },
  { valor: "sistema", rotulo: "Do sistema", Icone: Monitor },
];

function aplicar(escolha: Escolha) {
  const raiz = document.documentElement;
  if (escolha === "sistema") {
    raiz.removeAttribute("data-theme");
    try {
      localStorage.removeItem(CHAVE_TEMA);
    } catch {
      /* Modo privado ou armazenamento bloqueado: o tema vale só para esta aba. */
    }
    return;
  }
  raiz.setAttribute("data-theme", escolha === "escuro" ? "dark" : "light");
  try {
    localStorage.setItem(CHAVE_TEMA, escolha);
  } catch {
    /* idem */
  }
}

export function SeletorTema() {
  const [escolha, setEscolha] = useState<Escolha>("sistema");

  // O servidor não conhece a preferência, então o estado só se acerta depois da
  // montagem. O script do layout já pintou a tela certa antes disso.
  useEffect(() => {
    const marcado = document.documentElement.getAttribute("data-theme");
    setEscolha(marcado === "dark" ? "escuro" : marcado === "light" ? "claro" : "sistema");
  }, []);

  return (
    <fieldset className="border-0 p-0">
      <legend className="font-display font-semibold text-tinta">Cores da tela</legend>
      <p className="mt-1 mb-3 text-sm text-tinta-suave">
        Para estudar à noite sem a tela clarear o quarto inteiro.
      </p>
      <div className="flex flex-wrap gap-2">
        {opcoes.map(({ valor, rotulo, Icone }) => {
          const ativo = escolha === valor;
          return (
            <button
              key={valor}
              type="button"
              aria-pressed={ativo}
              onClick={() => {
                aplicar(valor);
                setEscolha(valor);
              }}
              className={cn(
                "inline-flex min-h-11 items-center gap-2 rounded-controle border-2 px-4 font-display text-sm font-semibold transition-transform duration-100 active:translate-y-0.5",
                ativo
                  ? "border-verde-fundo bg-verde-solido text-sobre-verde"
                  : "border-sombra bg-creme text-tinta hover:bg-papel",
              )}
            >
              <Icone size={17} aria-hidden="true" />
              {rotulo}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
