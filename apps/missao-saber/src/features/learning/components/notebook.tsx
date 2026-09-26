"use client";
import { Label } from "@informach/ui/components/label";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BotaoChapa } from "@/components/ui/botao-chapa";
import { Chapa } from "@/components/ui/chapa";
import { useServerAction } from "@/lib/use-server-action";
import { noteAction, removeNoteAction } from "../actions";

export function Notebook({
  profileId,
  notes,
}: {
  profileId: string;
  notes: { id: string; text: string; createdAt: string }[];
}) {
  const [text, setText] = useState("");
  const [message, setMessage] = useState("");
  const [pending, start] = useServerAction();
  const router = useRouter();
  return (
    <>
      <form
        className="rounded-card border-2 border-sol/45 bg-sol-claro p-5 shadow-[0_4px_0_color-mix(in_oklab,var(--ms-sol)_32%,transparent)]"
        onSubmit={(event) => {
          event.preventDefault();
          start(async () => {
            try {
              const result = await noteAction({ profileId, text });
              if (result.ok) {
                setText("");
                setMessage("Descoberta guardada.");
                router.refresh();
              } else setMessage(result.error);
            } catch {
              setMessage(
                "Não foi possível guardar. Seu texto continua aqui para tentar novamente.",
              );
            }
          });
        }}
      >
        <Label htmlFor="descoberta" className="font-display text-lg font-semibold">
          Hoje eu descobri que…
        </Label>
        <textarea
          id="descoberta"
          value={text}
          onChange={(e) => setText(e.target.value)}
          minLength={3}
          maxLength={1000}
          required
          rows={5}
          placeholder="Que estratégia funcionou? O que você mudaria na próxima tentativa?"
          className="mt-2 w-full rounded-controle border-2 border-sombra bg-creme p-3.5 text-tinta placeholder:text-tinta-suave/70"
        />
        <p className="mt-1.5 text-xs text-tinta-suave">
          Até 1.000 caracteres. Use apenas ideias e raciocínios; não inclua dados pessoais.
        </p>
        <BotaoChapa type="submit" className="mt-3" disabled={pending}>
          Guardar descoberta
        </BotaoChapa>
        <p role="status" className="mt-2 text-sm font-semibold text-tinta">
          {message}
        </p>
      </form>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {notes.map((note) => (
          <Chapa key={note.id} tom="creme" className="flex flex-col">
            <span className="font-display text-xs font-semibold text-tinta-suave">
              {new Date(note.createdAt).toLocaleDateString("pt-BR")}
            </span>
            <p className="mt-2 mb-4 text-[1.05rem] leading-relaxed whitespace-pre-wrap text-tinta italic">
              {note.text}
            </p>
            <button
              type="button"
              disabled={pending}
              className="mt-auto self-start rounded-md text-sm font-semibold text-tinta-suave underline underline-offset-4 hover:text-tinta"
              onClick={() => {
                if (!window.confirm("Remover esta descoberta do caderno?")) return;
                start(async () => {
                  try {
                    const result = await removeNoteAction(profileId, note.id);
                    if (result.ok) router.refresh();
                    else setMessage(result.error);
                  } catch {
                    setMessage("Não foi possível remover a descoberta.");
                  }
                });
              }}
            >
              Remover
            </button>
          </Chapa>
        ))}
      </div>
    </>
  );
}
