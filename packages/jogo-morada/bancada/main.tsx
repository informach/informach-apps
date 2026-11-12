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
 * `&validade=20` faz a sessão de jogo valer 20 segundos em vez de 15 minutos,
 * para ver a renovação acontecer sem esperar. `&arte` veste os moradores com
 * os pacotes que o servidor entrega (ele precisa de `MORADA_ARTE_DIR`).
 */

const SERVIDOR: string = import.meta.env.VITE_MORADA_DEV ?? "http://localhost:3010";

type SessaoDeJogo = { sessao: string; validadeMs: number };
type Entrada = SessaoDeJogo & { mundoId: string; endereco: string };

function ehSessao(valor: unknown): valor is SessaoDeJogo {
  if (typeof valor !== "object" || valor === null) return false;
  const { sessao, validadeMs } = valor as Record<string, unknown>;
  return typeof sessao === "string" && typeof validadeMs === "number" && validadeMs > 0;
}

function ehEntrada(valor: unknown): valor is Entrada {
  if (!ehSessao(valor)) return false;
  const { mundoId, endereco } = valor as Record<string, unknown>;
  return typeof mundoId === "string" && typeof endereco === "string";
}

async function pedir(caminho: string, corpo: unknown): Promise<unknown> {
  const resposta = await fetch(`${SERVIDOR}${caminho}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(corpo),
  });
  if (!resposta.ok) throw new Error(`O servidor de desenvolvimento respondeu ${resposta.status}`);
  return resposta.json();
}

/**
 * A fonte do mundo feita do servidor de desenvolvimento. Faz o papel do SDK do
 * Recreio: guarda a sessão de jogo, renova antes de ela vencer e avisa o jogo,
 * que manda `renovar_sessao` ao servidor.
 */
function fonteDeDesenvolvimento(apelido: string, validadeS?: number): FonteDoMundo {
  let atual: SessaoDeJogo | null = null;
  let renovacoes = 0;
  let espera: ReturnType<typeof setTimeout> | null = null;
  const ouvintes = new Set<(token: string) => void>();

  /** A próxima renovação fica a um terço da validade: de 5 em 5 minutos na sessão de 15. */
  function agendar(): void {
    if (espera !== null) clearTimeout(espera);
    espera = null;
    if (atual && ouvintes.size > 0) espera = setTimeout(renovar, atual.validadeMs / 3);
  }

  function renovar(): void {
    const antes = atual;
    if (!antes) return;
    pedir("/dev/renovar", { sessao: antes.sessao })
      .then((dados) => {
        // Se o mundo foi reaberto enquanto o pedido ia e voltava, a sessão vigente já é outra.
        if (atual !== antes || !ehSessao(dados)) return;
        atual = { sessao: dados.sessao, validadeMs: dados.validadeMs };
        for (const ouvinte of ouvintes) ouvinte(dados.sessao);
        // Fica à vista no documento, para os testes conferirem que a sessão foi renovada.
        document.documentElement.dataset.moradaRenovacoes = String(++renovacoes);
      })
      // Sem resposta agora: tenta de novo na próxima volta, enquanto a sessão ainda vale.
      .catch(() => {})
      .finally(agendar);
  }

  return {
    async abrir() {
      // Reabrir depois de uma queda é continuar: a mesma sessão, com prazo novo, e o servidor
      // retoma a reserva. Se o servidor reiniciou, vêm um mundo novo e uma sessão nova.
      const dados = await pedir("/dev/entrar", { apelido, continuar: atual !== null, validadeS });
      if (!ehEntrada(dados)) throw new Error("Resposta inesperada do servidor de desenvolvimento");
      atual = { sessao: dados.sessao, validadeMs: dados.validadeMs };
      agendar();
      return { endereco: dados.endereco, mundoId: dados.mundoId };
    },
    token() {
      if (!atual) throw new Error("A sessão só existe depois de abrir o mundo");
      return atual.sessao;
    },
    aoRenovar(ouvinte) {
      ouvintes.add(ouvinte);
      agendar();
      return () => {
        ouvintes.delete(ouvinte);
        // Sem ninguém ouvindo (o jogo acabou ou foi desmontado), para de renovar.
        agendar();
      };
    },
  };
}

function Jogo(props: { apelido: string; validadeS?: number; arte: boolean; aoSair(): void }) {
  const { apelido, validadeS, arte, aoSair } = props;
  const fonte = useMemo(() => fonteDeDesenvolvimento(apelido, validadeS), [apelido, validadeS]);
  return (
    <MoradaJogo
      className="bancada-jogo"
      fonte={fonte}
      origemDaArte={arte ? SERVIDOR : undefined}
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
  const parametros = new URLSearchParams(window.location.search);
  const daUrl = parametros.get("apelido")?.trim() ?? "";
  const validade = Number(parametros.get("validade"));
  const [apelido, definirApelido] = useState(daUrl.length >= 2 ? daUrl.slice(0, 20) : "");
  const [rascunho, definirRascunho] = useState("");
  const [erro, definirErro] = useState("");

  if (apelido) {
    return (
      <Jogo
        apelido={apelido}
        validadeS={validade > 0 ? validade : undefined}
        arte={parametros.has("arte")}
        aoSair={() => definirApelido("")}
      />
    );
  }

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
