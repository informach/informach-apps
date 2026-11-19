"use client";
import { useHydrated } from "@informach/ui/hooks/use-hydrated";
import Link from "next/link";
import { useState, useTransition } from "react";
import { VERSAO_DA_DECLARACAO_ADULTA } from "@/features/grupo/convites-constantes";
import { autorizarTesteAction, retirarTesteAction } from "../actions";
import { VERSAO_DO_TESTE } from "../constantes";
import type { consultarMeuTeste } from "../service";

type MeuTeste = Awaited<ReturnType<typeof consultarMeuTeste>>;

export function ConsentimentoDoTeste({ estado, pedidoId }: { estado: MeuTeste; pedidoId: string }) {
  const [adulto, setAdulto] = useState(false);
  const [aceito, setAceito] = useState(false);
  const [erro, setErro] = useState("");
  const [recente, setRecente] = useState(false);
  const [conferir, setConferir] = useState(false);
  const [pendente, iniciar] = useTransition();
  const hidratado = useHydrated();
  const consentimento = estado.consentimento;
  const ativo = consentimento && !consentimento.retiradoEm;
  const novo = estado.modo !== "off" && estado.elegivel && !ativo;

  function executar(retirar: boolean) {
    if (pendente || conferir) return;
    setErro("");
    setRecente(false);
    iniciar(async () => {
      try {
        const resultado =
          retirar && consentimento
            ? await retirarTesteAction(consentimento.id)
            : await autorizarTesteAction({
                pedidoId,
                souAdulto: adulto,
                aceitoExperimento: aceito,
                versaoDaDeclaracao: VERSAO_DA_DECLARACAO_ADULTA,
                versaoDoTeste: VERSAO_DO_TESTE,
              });
        if (resultado.ok) {
          window.location.assign("/conta/teste");
          return;
        }
        setErro(
          resultado.code === "UNEXPECTED"
            ? "Não foi possível confirmar a resposta. Confira o estado do teste antes de fazer outro pedido."
            : resultado.error,
        );
        setRecente(resultado.code === "LOGIN_RECENTE" || resultado.code === "AUTH");
        setConferir(resultado.code === "UNEXPECTED");
      } catch {
        setErro(
          "A resposta não chegou. Confira o estado do seu teste antes de fazer outro pedido.",
        );
        setConferir(true);
      }
    });
  }

  return (
    <>
      {consentimento && (
        <section aria-labelledby="recibo-do-teste" className="painel mt-6 p-5 sm:p-6">
          <h2 id="recibo-do-teste" className="font-display text-xl font-bold">
            Sua autorização
          </h2>
          <p className="mt-3 text-tinta-suave">
            {ativo ? "Autorização registrada." : "Autorização retirada."}
          </p>
          {!estado.teste && ativo && (
            <p className="mt-2 text-tinta-suave">O prazo do teste ainda não começou.</p>
          )}
          {estado.teste && (
            <p className="mt-2 text-tinta-suave">
              Período registrado:{" "}
              <time dateTime={estado.teste.inicio}>
                {new Date(estado.teste.inicio).toLocaleString("pt-BR", {
                  timeZone: "America/Sao_Paulo",
                })}
              </time>
              {" até "}
              <time dateTime={estado.teste.fim}>
                {new Date(estado.teste.fim).toLocaleString("pt-BR", {
                  timeZone: "America/Sao_Paulo",
                })}
              </time>
              {" (horário de Brasília)."}
            </p>
          )}
          {ativo && (
            <>
              <p className="mt-3 text-sm text-tinta-suave">
                Retirar a autorização encerra o acesso concedido por este teste. Seus perfis e
                progresso ficam guardados. Uma assinatura ou outra concessão válida continua
                seguindo seu próprio prazo. Retirar a autorização não cancela uma assinatura.
              </p>
              <button
                type="button"
                className="rb rb-vazado mt-4"
                disabled={!hidratado || pendente || conferir}
                onClick={() => executar(true)}
              >
                {pendente ? "Confirmando…" : "Retirar autorização do teste"}
              </button>
            </>
          )}
        </section>
      )}
      {novo && (
        <form
          className="painel mt-6 p-5 sm:p-6"
          aria-labelledby="autorizar-teste"
          onSubmit={(evento) => {
            evento.preventDefault();
            executar(false);
          }}
        >
          <h2 id="autorizar-teste" className="font-display text-xl font-bold">
            Autorizar o teste gratuito
          </h2>
          <p className="mt-3 text-tinta-suave">
            Estamos comparando testes de 48 horas e sete dias. A duração é sorteada na primeira
            sessão autorizada e aparece nesta página. Cada conta pode usar o teste uma vez, com
            cobertura de até quatro jogadores. Não é preciso cartão e não há cobrança automática.
          </p>
          <p className="mt-3 text-tinta-suave">
            Autorizar agora não inicia o prazo. Ele começa quando um jogador do seu grupo consegue
            abrir a primeira sessão de jogo. Você pode administrar a conta sem jogar.
          </p>
          <label className="mt-5 flex min-h-11 items-start gap-3">
            <input
              type="checkbox"
              required
              checked={adulto}
              onChange={(e) => setAdulto(e.target.checked)}
              className="mt-1 size-5 shrink-0"
            />
            <span>
              Declaro ter 18 anos ou mais e assumo a responsabilidade pelos perfis que cadastrar.
            </span>
          </label>
          <label className="mt-3 flex min-h-11 items-start gap-3">
            <input
              type="checkbox"
              required
              checked={aceito}
              onChange={(e) => setAceito(e.target.checked)}
              className="mt-1 size-5 shrink-0"
            />
            <span>Entendi as duas durações e autorizo participar deste teste gratuito.</span>
          </label>
          <p className="mt-3 text-sm text-tinta-suave">
            Confira os{" "}
            <Link href="/termos" className="font-bold text-ceu underline">
              termos
            </Link>{" "}
            e a{" "}
            <Link href="/privacidade" className="font-bold text-ceu underline">
              privacidade
            </Link>
            .
          </p>
          <button
            type="submit"
            className="rb rb-sol mt-5"
            disabled={!hidratado || pendente || conferir || !adulto || !aceito}
          >
            {pendente ? "Confirmando…" : "Registrar autorização"}
          </button>
        </form>
      )}
      {estado.modo !== "experiment" && (
        <p className="mt-5 text-tinta-suave">
          O teste ainda não está liberado para começar a jogar.
        </p>
      )}
      {!estado.elegivel && !estado.teste && !ativo && (
        <p className="painel mt-6 p-5">
          Um novo teste não está disponível para esta conta. Seus perfis e progresso continuam
          guardados.
        </p>
      )}
      {erro && (
        <p role="alert" className="mt-5 font-semibold text-erro">
          {erro}
        </p>
      )}
      {conferir && (
        <a href="/conta/teste" className="rb rb-vazado mt-4">
          Conferir estado do teste
        </a>
      )}
      {recente && (
        <Link href="/entrar?recente=1&next=%2Fconta%2Fteste" className="rb rb-vazado mt-4">
          Entrar novamente
        </Link>
      )}
    </>
  );
}
