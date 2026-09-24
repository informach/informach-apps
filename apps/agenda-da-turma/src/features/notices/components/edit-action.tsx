"use client";
import { Button } from "@informach/ui/components/button";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { SubjectOptionsByProfile } from "@/features/subjects/options-service";
import { catchActionResult } from "@/lib/action-result";
import { setNoticeStatusAction, updateNoticeActionAction } from "../actions";
import { noticeErrorMessage } from "../messages";
import { type NoticeActionInput, updateNoticeActionSchema } from "../schemas";
import { ActionFields, type AssignableAdult, type RoutineProfile } from "./action-fields";

export function EditNoticeAction({
  id,
  version,
  initialValue,
  profiles,
  adults,
  subjectOptions,
  profileTurmas,
  isPro,
  canceled,
  shareLocked = false,
}: {
  id: string;
  version: number;
  initialValue: NoticeActionInput;
  profiles: RoutineProfile[];
  adults: AssignableAdult[];
  subjectOptions: SubjectOptionsByProfile;
  profileTurmas?: Record<string, string | null>;
  isPro: boolean;
  canceled: boolean;
  shareLocked?: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initialValue);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  return (
    <section className="space-y-5 rounded-xl border bg-card p-5 sm:p-6">
      <fieldset disabled={busy || canceled}>
        <ActionFields
          subjectOptions={subjectOptions}
          profileTurmas={profileTurmas}
          prefix="edit-action"
          value={value}
          onChange={setValue}
          profiles={profiles}
          adults={adults}
          isPro={isPro}
          shareLocked={shareLocked}
          lockProfile
        />
      </fieldset>
      {!canceled ? (
        <div className="flex flex-wrap gap-3">
          <Button
            disabled={busy}
            onClick={async () => {
              const parsed = updateNoticeActionSchema.safeParse({ id, version, action: value });
              if (!parsed.success) {
                setMessage(parsed.error.issues[0]?.message ?? "Confira os campos");
                return;
              }
              setBusy(true);
              const result = await catchActionResult(() => updateNoticeActionAction(parsed.data));
              setBusy(false);
              setMessage(
                result.ok
                  ? "Alteração salva. Os responsáveis verão a nova versão."
                  : noticeErrorMessage(result.error.code),
              );
              if (result.ok) router.refresh();
            }}
          >
            Salvar alteração
          </Button>
          <Button disabled={busy} variant="outline" onClick={() => setConfirmCancel(true)}>
            Cancelar atividade
          </Button>
        </div>
      ) : (
        <p className="font-medium text-muted-foreground">
          Atividade cancelada. O histórico foi preservado.
        </p>
      )}
      {confirmCancel ? (
        <div className="space-y-3 rounded-lg border border-destructive/30 p-4">
          <p className="text-sm">
            Cancelar para todos os responsáveis desta criança? O item sai das pendências e deixa de
            gerar lembretes.
          </p>
          <div className="flex gap-3">
            <Button
              variant="destructive"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const result = await catchActionResult(() =>
                  setNoticeStatusAction({ id, version, status: "canceled" }),
                );
                setBusy(false);
                setMessage(
                  result.ok ? "Atividade cancelada." : noticeErrorMessage(result.error.code),
                );
                setConfirmCancel(false);
                router.refresh();
              }}
            >
              Confirmar cancelamento
            </Button>
            <Button variant="ghost" onClick={() => setConfirmCancel(false)}>
              Voltar
            </Button>
          </div>
        </div>
      ) : null}
      {message ? (
        <p role="status" className="text-sm">
          {message}
        </p>
      ) : null}
    </section>
  );
}
