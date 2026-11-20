"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { confirmarEncerramentoAction } from "../actions";

/** Plain client state only: no schema/provider/runtime imports in the browser.
 * All three actual choices and original preview references go to the server. */
export function ConfirmacaoDeEncerramento({
  previa,
  operacao,
  aoBloquear,
}: {
  previa: { preparacaoId: string; planoSha256: string };
  operacao: { estado: string } | null;
  aoBloquear: (bloqueado: boolean) => void;
}) {
  const router = useRouter();
  const [participacao, confirmarParticipacao] = useState(false);
  const [perfis, confirmarPerfis] = useState(false);
  const [renovacoes, confirmarRenovacoes] = useState(false);
  const [pendente, iniciar] = useTransition();
  const [registrada, registrar] = useState(false);
  const [incerta, definirIncerta] = useState(false);
  const [erro, definirErro] = useState("");
  const [recente, definirRecente] = useState(false);
  if (operacao || registrada)
    return (
      <p className="mt-5 font-semibold" role="status">
        Pedido de encerramento confirmado. Acompanhe as etapas nos pedidos recentes abaixo.
      </p>
    );
  const completo = participacao && perfis && renovacoes;
  return (
    <form
      className="mt-6 space-y-4 border-t border-linha-forte pt-5"
      onSubmit={(evento) => {
        evento.preventDefault();
        if (pendente || !completo) return;
        definirErro("");
        definirRecente(false);
        aoBloquear(true);
        iniciar(async () => {
          try {
            const resposta = await confirmarEncerramentoAction({
              preparacaoId: previa.preparacaoId,
              planoSha256: previa.planoSha256,
              confirmoEncerramento: participacao,
              confirmoRetiradaDosPerfis: perfis,
              confirmoCancelamentoDaRenovacao: renovacoes,
            });
            if (resposta.ok) {
              registrar(true);
              definirIncerta(false);
            } else {
              definirErro(resposta.error);
              definirRecente(resposta.code === "AUTH" || resposta.code === "LOGIN_RECENTE");
              if (resposta.code === "UNEXPECTED") definirIncerta(true);
              else aoBloquear(false);
            }
            router.refresh();
          } catch {
            definirErro(
              "A resposta não chegou. Confira este mesmo pedido antes de preparar outro.",
            );
            definirIncerta(true);
            router.refresh();
          }
        });
      }}
    >
      <h3 className="font-display text-xl font-bold">Confirmar encerramento no Recreio</h3>
      <p className="text-tinta-suave">
        A confirmação bloqueia novas partidas e inicia um pedido que não pode ser desfeito nesta
        área. Primeiro conferimos as renovações; depois tratamos os perfis e vínculos selecionados.
        Mundos compartilhados podem ficar temporariamente indisponíveis.
      </p>
      <p className="text-sm text-tinta-suave">
        O progresso dos demais participantes será preservado. Sua conta Informach, os períodos já
        pagos e os registros financeiros permanecem. Referências de segurança seguem seus prazos
        originais, com acesso restrito.
      </p>
      <fieldset disabled={pendente || incerta} className="space-y-3">
        <legend className="mb-2 font-semibold">Confirme os três efeitos</legend>
        <label className="flex min-h-11 items-start gap-3">
          <input
            type="checkbox"
            checked={participacao}
            onChange={(e) => confirmarParticipacao(e.target.checked)}
            className="mt-1 size-5 shrink-0"
          />
          <span>Quero encerrar minha participação no Recreio e entendo que deixarei de jogar.</span>
        </label>
        <label className="flex min-h-11 items-start gap-3">
          <input
            type="checkbox"
            checked={perfis}
            onChange={(e) => confirmarPerfis(e.target.checked)}
            className="mt-1 size-5 shrink-0"
          />
          <span>
            Confirmo a retirada dos dados pessoais dos perfis selecionados, inclusive os que estão
            sob minha responsabilidade.
          </span>
        </label>
        <label className="flex min-h-11 items-start gap-3">
          <input
            type="checkbox"
            checked={renovacoes}
            onChange={(e) => confirmarRenovacoes(e.target.checked)}
            className="mt-1 size-5 shrink-0"
          />
          <span>
            Autorizo interromper as próximas renovações das minhas assinaturas do Recreio e encerrar
            os pedidos de compra ainda não enviados.
          </span>
        </label>
      </fieldset>
      <button type="submit" className="rb rb-vazado" disabled={pendente || !completo}>
        {pendente
          ? "Conferindo pedido…"
          : incerta
            ? "Conferir este pedido de encerramento"
            : "Confirmar encerramento no Recreio"}
      </button>
      {erro && (
        <p role="alert" className="font-semibold text-erro">
          {erro}
        </p>
      )}
      {recente && (
        <Link href="/entrar?recente=1&next=%2Fconta%2Fdados" className="rb rb-vazado">
          Entrar novamente para continuar
        </Link>
      )}
    </form>
  );
}
