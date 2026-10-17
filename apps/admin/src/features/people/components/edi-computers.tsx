"use client";
import { Laptop } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, FormMessage } from "@/components/form";
import { StatusPill } from "@/components/status";
import type { ActionResult } from "@/lib/action";
import { disconnectEdiAction } from "../actions";
import { DEVICE_REASONS } from "../service";
import { Choice, ConfirmSheet, NoteField } from "./confirm-sheet";

export type EdiComputer = { id: string; name: string; lastSeenLabel: string; connected: boolean };

export function EdiComputers({
  userId,
  firstName,
  staffFirstName,
  computers,
}: {
  userId: string;
  firstName: string;
  staffFirstName: string;
  computers: EdiComputer[];
}) {
  const router = useRouter();
  const [target, setTarget] = useState<EdiComputer | null>(null);
  const [reason, setReason] = useState<string>(DEVICE_REASONS[0]);
  const [note, setNote] = useState("");
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  function confirm() {
    if (!target) return;
    startTransition(async () => {
      const outcome = await disconnectEdiAction({
        userId,
        deviceId: target.id,
        reason,
        note: note || undefined,
      });
      setResult(outcome);
      if (outcome.ok) {
        setTarget(null);
        router.refresh();
      }
    });
  }

  return (
    <div className="grid gap-3">
      <ul className="m-0 grid list-none gap-2 p-0">
        {computers.map((computer) => (
          <li
            key={computer.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line-soft px-3.5 py-3"
          >
            <span className="flex min-w-0 items-center gap-2.5">
              <Laptop aria-hidden="true" className="size-5 shrink-0 text-ink-muted" />
              <span className="grid min-w-0">
                <strong className="truncate">{computer.name}</strong>
                <span className="text-[13px] text-ink-muted">visto {computer.lastSeenLabel}</span>
              </span>
            </span>
            <span className="flex flex-wrap items-center gap-2">
              <StatusPill tone={computer.connected ? "ok" : "muted"}>
                {computer.connected ? "Conectado" : "Desconectado"}
              </StatusPill>
              {computer.connected ? (
                <Button
                  variant="ghost"
                  className="min-h-11"
                  onClick={() => {
                    setNote("");
                    setResult(null);
                    setTarget(computer);
                  }}
                >
                  Desconectar
                </Button>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
      {result && !target ? (
        <FormMessage tone={result.ok ? "ok" : "bad"}>
          {result.ok ? result.message : result.error}
        </FormMessage>
      ) : null}

      <ConfirmSheet
        open={target !== null}
        title={`Desconectar "${target?.name ?? ""}" da conta de ${firstName}?`}
        consequences={[
          "A vaga do computador fica livre agora: a pessoa pode conectar outro.",
          "As ferramentas param de abrir nesse computador na próxima validação da licença, em até 72 horas.",
          "Os arquivos que estão no computador não são apagados.",
        ]}
        onClose={() => setTarget(null)}
      >
        <Choice
          id="edi-motivo"
          label="Motivo"
          value={reason}
          options={DEVICE_REASONS}
          onChange={setReason}
        />
        <NoteField
          id="edi-nota"
          label={
            reason === "Outro motivo"
              ? "Qual o motivo (sem dados pessoais)"
              : "Nota para a equipe (opcional, sem dados pessoais)"
          }
          required={reason === "Outro motivo"}
          value={note}
          onChange={setNote}
        />
        <p className="m-0 text-[13px] text-ink-muted">
          Fica registrado na auditoria em nome de {staffFirstName}, com o motivo.
        </p>
        {result && !result.ok && target ? (
          <FormMessage tone="bad">{result.error}</FormMessage>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button variant="danger" disabled={pending} onClick={confirm}>
            {pending ? "Um instante..." : "Desconectar computador"}
          </Button>
          <Button variant="ghost" disabled={pending} onClick={() => setTarget(null)}>
            Voltar
          </Button>
        </div>
      </ConfirmSheet>
    </div>
  );
}
