"use client";
import { Label } from "@informach/ui/components/label";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BotaoChapa } from "@/components/ui/botao-chapa";
import { Chapa } from "@/components/ui/chapa";
import type { LabAttachment } from "@/features/labs/runtime/schemas";
import { useHydrated } from "@/lib/use-hydrated";
import { useServerAction } from "@/lib/use-server-action";
import { archiveNoteAction, editNoteAction, noteAction, removeNoteAction } from "../actions";
import type { NoteContext } from "../repository";
import { useNoteDraft } from "./use-note-draft";

type Entry = {
  id: string;
  text: string;
  createdAt: string;
  archivedAt: string | null;
  context: NoteContext | null;
  labAttachment?: LabAttachment | null;
};

function NoteEntry({ note, profileId, ready }: { note: Entry; profileId: string; ready: boolean }) {
  const [editing, setEditing] = useState(false);
  const draft = useNoteDraft(`${profileId}:edit:${note.id}`, note.text);
  const { text, change: setText } = draft;
  const [message, setMessage] = useState("");
  const [pending, start] = useServerAction();
  const router = useRouter();
  function archive() {
    start(async () => {
      try {
        const result = await archiveNoteAction(profileId, note.id, !note.archivedAt);
        if (result.ok) router.refresh();
        else setMessage(result.error);
      } catch {
        setMessage("Não foi possível mudar o arquivo. Tente novamente.");
      }
    });
  }
  return (
    <Chapa tom="creme" className="flex min-w-0 flex-col" data-note-id={note.id}>
      <span className="font-display text-xs font-semibold text-tinta-suave">
        {new Date(note.createdAt).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}
      </span>
      {note.context && (
        <details className="mt-2 text-sm wrap-anywhere text-tinta-suave">
          <summary className="cursor-pointer font-semibold">
            Da missão: {note.context.title}
          </summary>
          {note.context.prompt && <p className="mt-2">{note.context.prompt}</p>}
          <Link className="mt-2 inline-block underline" href={`/missao/${note.context.sessionId}`}>
            Revisitar missão
          </Link>
        </details>
      )}
      {note.labAttachment && (
        <details className="mt-3 text-sm text-tinta-suave">
          <summary className="min-h-11 cursor-pointer font-semibold">
            Investigação: {note.labAttachment.title}
          </summary>
          <p className="mt-2 font-semibold">{note.labAttachment.skill}</p>
          <p className="mt-2">{note.labAttachment.question}</p>
          <p className="mt-2">
            Previsão: {note.labAttachment.document.prediction || "Não registrada por escrito"}
          </p>
          <p className="mt-2">Montagem: {note.labAttachment.summary}</p>
          <p className="mt-2">
            Observação: {note.labAttachment.document.observation || "Não registrada por escrito"}
          </p>
          <p className="mt-2">
            Explicação: {note.labAttachment.document.explanation || "Não registrada por escrito"}
          </p>
          {note.labAttachment.transfer && (
            <div className="mt-3 border-t border-sombra pt-3">
              <p className="font-semibold">Novo caso</p>
              <p className="mt-2">{note.labAttachment.transfer.question}</p>
              <p className="mt-2">Montagem do novo caso: {note.labAttachment.transfer.summary}</p>
              <p className="mt-2">
                Sua resposta:{" "}
                {note.labAttachment.document.transferAnswer || "Não registrada por escrito"}
              </p>
            </div>
          )}
          {note.labAttachment.assessment && (
            <p className="mt-2">Devolutiva do novo caso: {note.labAttachment.assessment.message}</p>
          )}
          <Link className="mt-3 inline-block underline" href={`/laboratorio?note=${note.id}`}>
            Reabrir a montagem guardada
          </Link>
          <Link
            className="mt-3 block underline"
            href={`/laboratorio?exec=${note.labAttachment.executionId}`}
          >
            Continuar a investigação atual
          </Link>
          <p className="mt-2">Este registro preserva a montagem da data em que foi guardado.</p>
        </details>
      )}
      {editing ? (
        <form
          className="mt-3"
          onSubmit={(event) => {
            event.preventDefault();
            start(async () => {
              try {
                const sent = text;
                const result = await editNoteAction({ profileId, id: note.id, text: sent });
                if (result.ok) {
                  draft.confirm(sent, false);
                  setEditing(false);
                  setMessage("Alteração guardada.");
                  router.refresh();
                } else setMessage(result.error);
              } catch {
                setMessage("Não foi possível salvar. Seu texto continua aqui.");
              }
            });
          }}
        >
          <Label htmlFor={`note-${note.id}`}>Editar descoberta</Label>
          <textarea
            id={`note-${note.id}`}
            value={text}
            disabled={!ready || pending}
            onChange={(event) => setText(event.target.value)}
            minLength={3}
            maxLength={1000}
            required
            rows={5}
            className="mt-2 w-full rounded-controle border-2 border-sombra p-3"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <BotaoChapa type="submit" medida="p" disabled={!ready || pending}>
              Salvar alteração
            </BotaoChapa>
            <BotaoChapa
              type="button"
              tom="contorno"
              medida="p"
              disabled={!ready || pending}
              onClick={() => {
                draft.discard();
                setEditing(false);
              }}
            >
              Cancelar edição
            </BotaoChapa>
          </div>
          {draft.storageError && (
            <p role="status" className="mt-2 text-sm text-tinta-suave">
              Este navegador não permitiu guardar o rascunho. Copie seu texto antes de sair desta
              tela.
            </p>
          )}
        </form>
      ) : (
        <p className="mt-2 mb-4 text-[1.05rem] leading-relaxed whitespace-pre-wrap wrap-anywhere text-tinta italic">
          {note.text}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-4 text-sm font-semibold underline underline-offset-4">
        {!editing && (
          <button
            type="button"
            disabled={!ready || pending}
            onClick={() => {
              setEditing(true);
              setMessage("");
            }}
          >
            Editar
          </button>
        )}
        <button type="button" disabled={!ready || pending || editing} onClick={archive}>
          {note.archivedAt ? "Restaurar" : "Arquivar"}
        </button>
        <button
          type="button"
          disabled={!ready || pending || editing}
          onClick={() => {
            if (
              !window.confirm(
                "Remover definitivamente esta descoberta? Você também pode arquivá-la sem apagar.",
              )
            )
              return;
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
      </div>
      <p role="status" className="mt-2 text-sm">
        {message}
      </p>
    </Chapa>
  );
}

export function Notebook({
  profileId,
  notes,
  activeCount,
  archivedCount,
  context,
  archived,
  search,
}: {
  profileId: string;
  notes: Entry[];
  activeCount: number;
  archivedCount: number;
  context?: NoteContext;
  archived: boolean;
  search: string;
}) {
  const draft = useNoteDraft(
    `${profileId}:new:${context?.sessionId ?? "general"}:${context?.itemId ?? ""}`,
  );
  const { text, change: setText } = draft;
  const [message, setMessage] = useState("");
  const [includeContext, setIncludeContext] = useState(true);
  const [pending, start] = useServerAction();
  // O filtro GET e o acesso direto entregam HTML antes dos listeners. Só
  // habilite controles React quando puderem realmente receber a interação.
  const ready = useHydrated();
  const router = useRouter();
  return (
    <>
      <form
        className="rounded-card border-2 border-sol/45 bg-sol-claro p-5 shadow-[0_4px_0_color-mix(in_oklab,var(--ms-sol)_32%,transparent)]"
        onSubmit={(event) => {
          event.preventDefault();
          start(async () => {
            try {
              const result = await noteAction({
                profileId,
                text,
                context:
                  includeContext && context
                    ? { sessionId: context.sessionId, itemId: context.itemId ?? undefined }
                    : undefined,
              });
              if (result.ok) {
                draft.confirm(text, true);
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
          disabled={!ready}
          onChange={(e) => setText(e.target.value)}
          minLength={3}
          maxLength={1000}
          required
          rows={5}
          placeholder="Que estratégia funcionou? O que você mudaria na próxima tentativa?"
          className="mt-2 w-full rounded-controle border-2 border-sombra bg-creme p-3.5 text-tinta placeholder:text-tinta-suave/70"
        />
        {context && (
          <label className="mt-3 flex items-start gap-2 text-sm wrap-anywhere">
            <input
              type="checkbox"
              checked={includeContext}
              disabled={!ready}
              onChange={(event) => setIncludeContext(event.target.checked)}
              className="mt-1"
            />
            <span>
              Vincular à missão “{context.title}”{context.prompt ? `: ${context.prompt}` : ""}
            </span>
          </label>
        )}
        <p className="mt-1.5 text-xs text-tinta-suave">
          Até 1.000 caracteres. Use apenas ideias e raciocínios; não inclua dados pessoais.
        </p>
        <p className="mt-2 text-xs text-tinta-suave">
          {draft.storageError
            ? "Este navegador não permitiu guardar o rascunho. Copie seu texto antes de sair desta tela."
            : "O rascunho fica nesta aba para este estudante. Para salvar na conta, use Guardar descoberta."}
        </p>
        <p className="mt-2 text-sm text-tinta-suave">
          {activeCount} de 100 anotações ativas. Arquivar preserva suas ideias e libera espaço.
        </p>
        <BotaoChapa
          type="submit"
          className="mt-3"
          disabled={!ready || pending || activeCount >= 100}
        >
          Guardar descoberta
        </BotaoChapa>
        <p role="status" className="mt-2 text-sm font-semibold text-tinta">
          {message}
        </p>
      </form>

      <form
        method="get"
        action="/caderno"
        className="mt-7 grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end"
      >
        <div>
          <Label htmlFor="buscar-descobertas">Buscar no caderno</Label>
          <input
            type="search"
            id="buscar-descobertas"
            name="q"
            defaultValue={search}
            maxLength={100}
            className="mt-1.5 w-full rounded-controle border-2 border-sombra p-3"
          />
        </div>
        <div>
          <Label htmlFor="arquivo-caderno">Mostrar</Label>
          <select
            id="arquivo-caderno"
            name="archived"
            defaultValue={archived ? "1" : "0"}
            className="mt-1.5 w-full rounded-controle border-2 border-sombra p-3"
          >
            <option value="0">Ativas ({activeCount})</option>
            <option value="1">Arquivadas ({archivedCount})</option>
          </select>
        </div>
        <BotaoChapa type="submit" tom="contorno">
          Buscar
        </BotaoChapa>
      </form>
      <h2 className="mt-6 font-display text-xl font-semibold">
        {archived ? "Descobertas arquivadas" : "Suas descobertas"}
      </h2>
      {!notes.length && (
        <p className="mt-3 text-tinta-suave">
          {search
            ? "Nenhuma descoberta encontrada nessa busca."
            : archived
              ? "Seu arquivo ainda está vazio."
              : "As descobertas guardadas aparecerão aqui."}
        </p>
      )}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {notes.map((note) => (
          <NoteEntry key={note.id} profileId={profileId} note={note} ready={ready} />
        ))}
      </div>
    </>
  );
}
