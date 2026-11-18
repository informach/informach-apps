"use client";
import { useHydrated } from "@informach/ui/hooks/use-hydrated";
import { useId, useState, useTransition } from "react";
import { encerrarConviteDoMenorAction } from "../convites-dirigidos-actions";

export function EncerrarConviteDoMenor({
  perfilId,
  conviteId,
}: {
  perfilId: string;
  conviteId: string;
}) {
  const id = useId(),
    pronto = useHydrated(),
    [pendente, iniciar] = useTransition();
  const [confirmo, confirmar] = useState(false),
    [enviado, marcar] = useState(false),
    [mensagem, avisar] = useState("");
  return (
    <form
      aria-label="Encerrar convite do perfil"
      className="mt-4 grid gap-3 border-t border-linha pt-4"
      onSubmit={(evento) => {
        evento.preventDefault();
        if (!pronto || pendente || enviado || !confirmo) return;
        marcar(true);
        iniciar(async () => {
          try {
            const r = await encerrarConviteDoMenorAction({ perfilId, conviteId, confirmo: true });
            avisar(
              r.ok
                ? r.data.estado === "accepted"
                  ? "Este convite já foi aceito. Confira a participação e os cuidados do perfil na supervisão."
                  : "O convite está encerrado. Atualize a lista para conferir a situação."
                : r.error,
            );
          } catch {
            avisar("Não recebemos a confirmação. Atualize a lista antes de repetir.");
          }
        });
      }}
    >
      <label htmlFor={id} className="flex min-h-11 items-start gap-3 text-sm">
        <input
          id={id}
          type="checkbox"
          className="mt-1 size-5 shrink-0 accent-ceu"
          checked={confirmo}
          disabled={!pronto || pendente || enviado}
          onChange={(e) => confirmar(e.target.checked)}
          required
        />
        <span>
          Quero encerrar este convite do perfil. Participações já aceitas permanecem guardadas.
        </span>
      </label>
      <button
        type="submit"
        className="rb rb-vazado w-fit"
        disabled={!pronto || pendente || enviado || !confirmo}
      >
        {pendente ? "Encerrando…" : "Encerrar este convite"}
      </button>
      {mensagem && (
        <p role="status" className="text-sm">
          {mensagem}
        </p>
      )}
    </form>
  );
}
