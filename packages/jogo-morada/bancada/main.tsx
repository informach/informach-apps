import { type FormEvent, StrictMode, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import type { FonteDoMundo } from "../src/index";
import { MoradaJogo } from "../src/MoradaJogo";

/**
 * A bancada: pede um apelido, entra no mundo de desenvolvimento do servidor do
 * jogo (`MORADA_PLATAFORMA=falsa`, porta 3010) e monta o cliente. O primeiro
 * apelido cria o mundo; os outros entram dividindo a mesma família.
 *
 * `?apelido=Lia` entra direto, para abrir duas abas depressa e para os testes.
 */

const SERVIDOR: string = import.meta.env.VITE_MORADA_DEV ?? "http://localhost:3010";

type Entrada = { sessao: string; mundoId: string; endereco: string };

function ehEntrada(valor: unknown): valor is Entrada {
  if (typeof valor !== "object" || valor === null) return false;
  const { sessao, mundoId, endereco } = valor as Record<string, unknown>;
  return typeof sessao === "string" && typeof mundoId === "string" && typeof endereco === "string";
}

/** A fonte do mundo feita do servidor de desenvolvimento. */
function fonteDeDesenvolvimento(apelido: string): FonteDoMundo {
  let atual: { sessao: string; mundoId: string } | null = null;
  return {
    async abrir() {
      const resposta = await fetch(`${SERVIDOR}/dev/entrar`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ apelido }),
      });
      if (!resposta.ok)
        throw new Error(`O servidor de desenvolvimento respondeu ${resposta.status}`);
      const dados: unknown = await resposta.json();
      if (!ehEntrada(dados)) throw new Error("Resposta inesperada do servidor de desenvolvimento");
      // No mesmo mundo, a sessão é mantida: é com ela que o servidor retoma a reserva
      // depois de uma queda. Mundo novo é servidor reiniciado, e a sessão antiga não vale mais.
      if (!atual || atual.mundoId !== dados.mundoId) {
        atual = { sessao: dados.sessao, mundoId: dados.mundoId };
      }
      return { endereco: dados.endereco, mundoId: dados.mundoId };
    },
    token() {
      if (!atual) throw new Error("A sessão só existe depois de abrir o mundo");
      return atual.sessao;
    },
  };
}

function Jogo({ apelido, aoSair }: { apelido: string; aoSair(): void }) {
  const fonte = useMemo(() => fonteDeDesenvolvimento(apelido), [apelido]);
  return (
    <MoradaJogo
      className="bancada-jogo"
      fonte={fonte}
      aoSair={aoSair}
      // O motivo fica à vista no documento, para os testes conferirem que quem hospeda é avisado.
      aoEncerrar={(motivo) => {
        document.documentElement.dataset.moradaFim = motivo;
      }}
      depurar
    />
  );
}

function Bancada() {
  const daUrl = new URLSearchParams(window.location.search).get("apelido")?.trim() ?? "";
  const [apelido, definirApelido] = useState(daUrl.length >= 2 ? daUrl.slice(0, 20) : "");
  const [rascunho, definirRascunho] = useState("");
  const [erro, definirErro] = useState("");

  if (apelido) return <Jogo apelido={apelido} aoSair={() => definirApelido("")} />;

  const entrar = (evento: FormEvent) => {
    evento.preventDefault();
    const limpo = rascunho.trim();
    if (limpo.length < 2 || limpo.length > 20) {
      definirErro("O apelido precisa ter de 2 a 20 letras.");
      return;
    }
    definirErro("");
    definirApelido(limpo);
  };

  return (
    <main className="bancada-entrada">
      <form onSubmit={entrar}>
        <h1>Morada</h1>
        <p>
          Bancada de desenvolvimento. O primeiro apelido cria o mundo; os outros entram na mesma
          família. Nada é salvo.
        </p>
        <label>
          Apelido
          <input
            name="apelido"
            autoComplete="off"
            maxLength={20}
            value={rascunho}
            onChange={(evento) => definirRascunho(evento.target.value)}
          />
        </label>
        {erro ? (
          <p className="bancada-erro" role="alert">
            {erro}
          </p>
        ) : null}
        <button type="submit">Entrar</button>
      </form>
    </main>
  );
}

const raiz = document.getElementById("raiz");
if (raiz) {
  createRoot(raiz).render(
    <StrictMode>
      <Bancada />
    </StrictMode>,
  );
}
