"use client";
import { Label } from "@informach/ui/components/label";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { BotaoChapa } from "@/components/ui/botao-chapa";
import {
  contentAvailabilityAction,
  invalidateReportedVersionAction,
  updateReportAction,
} from "../actions";

const campo =
  "mt-1.5 block w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground";

export function ContentMaintenanceForm({
  lessonId,
  version,
  hash,
  itemIds,
}: {
  lessonId: string;
  version: number;
  hash: string;
  itemIds: string[];
}) {
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<"available" | "suspended">("available");
  const [invalidatedItemIds, setInvalidatedItemIds] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const campoId = `${lessonId}-${version}`;
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        start(async () => {
          try {
            const result = await contentAvailabilityAction({
              lessonId,
              version,
              hash,
              status,
              note,
              invalidatedItemIds,
            });
            if (result.ok) {
              setMessage("Manutenção do conteúdo registrada.");
              setNote("");
              setInvalidatedItemIds([]);
              router.refresh();
            } else setMessage(result.error);
          } catch {
            setMessage(
              "Não foi possível registrar a decisão. Confira o histórico antes de tentar novamente.",
            );
          }
        });
      }}
    >
      <div className="mb-4 max-w-72">
        <Label htmlFor={`decisao-${campoId}`}>Decisão</Label>
        <select
          id={`decisao-${campoId}`}
          className={`${campo} h-11`}
          value={status}
          onChange={(e) => {
            const next = e.target.value === "suspended" ? "suspended" : "available";
            setStatus(next);
            if (next === "available") setInvalidatedItemIds([]);
          }}
        >
          <option value="available">Disponibilizar para novas sessões</option>
          <option value="suspended">Pausar para correção</option>
        </select>
      </div>
      <div className="mb-4">
        <Label htmlFor={`nota-${campoId}`}>Motivo da manutenção</Label>
        <textarea
          id={`nota-${campoId}`}
          className={campo}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          minLength={20}
          maxLength={1000}
          required
          rows={3}
        />
      </div>
      {status === "suspended" && (
        <fieldset className="mb-4">
          <legend className="text-sm font-semibold">
            Atividades cuja evidência deve ser ignorada
          </legend>
          <p className="mb-2 text-sm text-muted-foreground">
            Marque somente atividades com erro confirmado. Deixe vazio para uma pausa preventiva.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {itemIds.map((itemId) => (
              <label key={itemId} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={invalidatedItemIds.includes(itemId)}
                  onChange={(event) =>
                    setInvalidatedItemIds((current) =>
                      event.target.checked
                        ? [...current, itemId]
                        : current.filter((id) => id !== itemId),
                    )
                  }
                />
                {itemId}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <BotaoChapa type="submit" tom="contorno" medida="p" disabled={pending}>
        Registrar manutenção
      </BotaoChapa>
      <p role="status" className="mt-2 text-sm font-medium">
        {message}
      </p>
    </form>
  );
}

export function ReportActions({ id, status }: { id: string; status: "open" | "investigating" }) {
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const submit = (nextStatus: "investigating" | "resolved") =>
    start(async () => {
      try {
        const result = await updateReportAction({ id, status: nextStatus, note });
        if (result.ok) router.refresh();
        else setMessage(result.error);
      } catch {
        setMessage("Não foi possível atualizar o relato.");
      }
    });
  return (
    <div className="mt-3">
      <Label htmlFor={`report-note-${id}`}>Registro do atendimento</Label>
      <textarea
        id={`report-note-${id}`}
        className={campo}
        value={note}
        onChange={(event) => setNote(event.target.value)}
        minLength={10}
        maxLength={1000}
        rows={2}
        placeholder="O que foi verificado ou corrigido?"
      />
      <div className="mt-2 flex flex-wrap gap-3">
        {status === "open" && (
          <button
            type="button"
            disabled={pending || note.trim().length < 10}
            className="rounded-md text-sm font-semibold underline underline-offset-4 disabled:opacity-60"
            onClick={() => submit("investigating")}
          >
            Registrar investigação
          </button>
        )}
        <button
          type="button"
          disabled={pending || note.trim().length < 10}
          className="rounded-md text-sm font-semibold underline underline-offset-4 disabled:opacity-60"
          onClick={() => submit("resolved")}
        >
          Marcar como tratado
        </button>
      </div>
      <p role="status" className="mt-1 text-sm text-muted-foreground">
        {message}
      </p>
    </div>
  );
}

export function ReportedVersionInvalidation({ reportId }: { reportId: string }) {
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <form
      className="mt-3 border-t border-border pt-3"
      onSubmit={(event) => {
        event.preventDefault();
        start(async () => {
          const result = await invalidateReportedVersionAction({ reportId, note });
          if (result.ok) {
            setMessage("Evidência desta versão invalidada.");
            setNote("");
            router.refresh();
          } else setMessage(result.error);
        });
      }}
    >
      <Label htmlFor={`reported-version-note-${reportId}`}>
        Motivo para invalidar a evidência desta versão
      </Label>
      <textarea
        id={`reported-version-note-${reportId}`}
        className={campo}
        value={note}
        onChange={(event) => setNote(event.target.value)}
        minLength={20}
        maxLength={1000}
        rows={2}
        required
      />
      <BotaoChapa type="submit" tom="contorno" medida="p" className="mt-2" disabled={pending}>
        Invalidar somente esta versão
      </BotaoChapa>
      <p role="status" className="mt-1 text-sm text-muted-foreground">
        {message}
      </p>
    </form>
  );
}
