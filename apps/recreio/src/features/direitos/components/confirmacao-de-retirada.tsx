"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { confirmarRetiradaAction } from "../actions";
import type { prepararPedidoDeDireitos } from "../service";

/** Estado local só apresenta a decisão. Mesmo um POST direto precisa da
 * autoridade atual, prévia intacta e confirmação literal no servidor. */
export function ConfirmacaoDeRetirada({
  previa,
  apelido,
  operacao,
}: {
  previa: Awaited<ReturnType<typeof prepararPedidoDeDireitos>>;
  apelido: string;
  operacao: { estado: string } | null;
}) {
  const router = useRouter();
  const [confirmo, confirmar] = useState(false);
  const [pendente, iniciar] = useTransition();
  const [registrada, registrar] = useState(false);
  const [incerta, definirIncerta] = useState(false);
  const [erro, definirErro] = useState("");
  const [recente, definirRecente] = useState(false);
  if (operacao || registrada)
    return (
      <p className="mt-5 font-semibold" role="status">
        Pedido confirmado. Acompanhe a retirada em pedidos recentes abaixo.
      </p>
    );
  return (
    <form
      className="mt-6 space-y-4 border-t border-linha-forte pt-5"
      onSubmit={(evento) => {
        evento.preventDefault();
        if (pendente || (!confirmo && !incerta)) return;
        definirErro("");
        definirRecente(false);
        iniciar(async () => {
          try {
            const resposta = await confirmarRetiradaAction({
              preparacaoId: previa.preparacaoId,
              planoSha256: previa.planoSha256,
              confirmoRetirada: true,
            });
            if (resposta.ok) {
              registrar(true);
              definirIncerta(false);
              router.refresh();
            } else {
              definirErro(resposta.error);
              definirRecente(resposta.code === "AUTH" || resposta.code === "LOGIN_RECENTE");
              if (resposta.code === "UNEXPECTED") definirIncerta(true);
              router.refresh();
            }
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
      <h3 className="font-display text-xl font-bold">Confirmar retirada de {apelido}</h3>
      <p className="text-tinta-suave">
        Este perfil deixará de jogar. Seus dados pessoais e vínculos serão retirados; o progresso
        compartilhado dos outros participantes será preservado. Mundos envolvidos poderão ficar
        indisponíveis durante o processamento.
      </p>
      <p className="text-sm text-tinta-suave">
        A confirmação inicia uma operação que não pode ser desfeita nesta área. Registros sujeitos a
        prazos de segurança e obrigações legais podem permanecer com acesso restrito. Sua conta
        Informach e a assinatura não serão encerradas.
      </p>
      <label className="flex min-h-11 items-start gap-3">
        <input
          type="checkbox"
          checked={confirmo}
          disabled={pendente || incerta}
          onChange={(e) => confirmar(e.target.checked)}
          className="mt-1 size-5 shrink-0"
        />
        <span>Confirmo a retirada de {apelido} e entendo os efeitos descritos.</span>
      </label>
      <button type="submit" className="rb rb-vazado" disabled={pendente || (!confirmo && !incerta)}>
        {pendente
          ? "Conferindo pedido…"
          : incerta
            ? "Conferir este pedido"
            : "Confirmar retirada do perfil"}
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
