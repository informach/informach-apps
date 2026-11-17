"use client";
import { useHydrated } from "@informach/ui/hooks/use-hydrated";
import { useEffect, useState, useTransition } from "react";
import { consultarPareamentoAction, prepararPareamentoAction } from "../actions";

export function ParearAparelho() {
  const [pedido, setPedido] = useState<{ codigo: string; expiraEm: string } | null>(null);
  const [erro, setErro] = useState("");
  const [encerrado, setEncerrado] = useState(false);
  const [pendente, iniciar] = useTransition();
  const interativo = useHydrated();

  useEffect(() => {
    if (!pedido) return;
    let cancelado = false;
    let timer: ReturnType<typeof setTimeout>;
    async function consultar() {
      let continuar = true;
      try {
        const resultado = await consultarPareamentoAction();
        if (cancelado) return;
        if (resultado.ok && resultado.data.estado === "pareado") {
          continuar = false;
          window.location.assign(resultado.data.destination);
        } else if (!resultado.ok) {
          continuar = false;
          setErro(resultado.error);
          setEncerrado(true);
        }
      } catch {
        if (!cancelado) setErro("A conexão foi interrompida. Vou conferir novamente.");
      } finally {
        if (!cancelado && continuar) timer = setTimeout(consultar, 3000);
      }
    }
    timer = setTimeout(consultar, 1000);
    return () => {
      cancelado = true;
      clearTimeout(timer);
    };
  }, [pedido]);

  function abrir() {
    setErro("");
    iniciar(async () => {
      try {
        const resultado = await prepararPareamentoAction();
        if (resultado.ok) {
          setPedido(resultado.data);
          setEncerrado(false);
        } else setErro(resultado.error);
      } catch {
        setErro("Não foi possível abrir o código. Tente novamente.");
      }
    });
  }

  return (
    <section aria-labelledby="codigo-aparelho" className="painel mt-8 p-6 sm:p-8">
      <h2 id="codigo-aparelho" className="font-display text-2xl font-bold">
        Este aparelho vai ser de quem?
      </h2>
      <p className="mt-3 text-tinta-suave">
        O responsável escolhe o perfil na própria conta. Este aparelho fica dedicado a esse perfil e
        pede uma nova entrada para abrir a área do adulto.
      </p>
      {pedido && !encerrado ? (
        <>
          <output
            aria-label="Código de pareamento"
            className="mt-8 block text-center font-mono text-3xl font-bold tracking-[0.12em] text-ceu sm:text-4xl"
          >
            {pedido.codigo.slice(0, 5)} {pedido.codigo.slice(5)}
          </output>
          <p className="mt-4 text-center text-sm text-tinta-suave">
            Válido por até cinco minutos. Aguardando a confirmação do responsável.
          </p>
        </>
      ) : (
        <button
          type="button"
          onClick={abrir}
          disabled={!interativo || pendente}
          className="rb rb-sol rb-lg mt-6"
        >
          {pendente
            ? "Preparando…"
            : pedido
              ? "Gerar outro código"
              : "Mostrar código deste aparelho"}
        </button>
      )}
      <p role="status" className="mt-4 min-h-5 text-sm font-semibold text-coral">
        {erro}
      </p>
    </section>
  );
}
