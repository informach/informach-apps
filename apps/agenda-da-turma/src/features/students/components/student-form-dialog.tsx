"use client";
import { Button } from "@informach/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@informach/ui/components/dialog";
import { Input } from "@informach/ui/components/input";
import { toast } from "@informach/ui/components/sonner";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState, useTransition } from "react";
import { todayLocalIso } from "@/features/dashboard/date";
import { catchActionResult, isActionRejected } from "@/lib/action-result";
import {
  availableStudentsAction,
  createStudentProfileAction,
  updateStudentProfileAction,
} from "../actions";
import type { StudentProfile } from "../types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile?: StudentProfile;
};

export function StudentFormDialog({ open, onOpenChange, profile }: Props) {
  const router = useRouter();
  const fieldId = useId();
  const [submitting, startSubmit] = useTransition();
  const [personId, setPersonId] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [choices, setChoices] = useState<{ id: string; name: string }[] | null>(null);
  const [error, setError] = useState("");
  const requestSequence = useRef(0);
  const profileId = profile?.id;
  const savedBirthDate = profile?.birthDate;

  const loadChoices = useCallback(async () => {
    const request = ++requestSequence.current;
    setError("");
    setChoices(null);
    const result = await catchActionResult(() => availableStudentsAction({}));
    if (request !== requestSequence.current) return;
    if (result.ok) setChoices(result.value);
    else setError("Não foi possível carregar as crianças. Confira seu acesso ou tente novamente.");
  }, []);
  useEffect(() => {
    if (!open) return;
    setPersonId("");
    setBirthDate(savedBirthDate ?? "");
    setError("");
    if (!profileId) void loadChoices();
    return () => {
      requestSequence.current += 1;
    };
  }, [open, profileId, savedBirthDate, loadChoices]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {profile ? `Dados escolares de ${profile.name}` : "Adicionar criança à Agenda"}
          </DialogTitle>
          <DialogDescription>
            {profile
              ? "O nome é compartilhado entre os aplicativos. Aqui você pode atualizar a data de nascimento usada na rotina escolar."
              : "Escolha uma criança já cadastrada na Minha conta. Escola, turma e horário podem vir depois."}
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            setError("");
            startSubmit(async () => {
              if (profile) {
                const result = await catchActionResult(() =>
                  updateStudentProfileAction({ id: profile.id, birthDate }),
                );
                if (!result.ok) {
                  setError("Não foi possível salvar. Confira os dados e seu acesso à criança.");
                  return;
                }
              } else {
                const result = await catchActionResult(() =>
                  createStudentProfileAction({ personId, birthDate }),
                );
                if (!result.ok) {
                  if (!isActionRejected(result.error) && result.error.code === "PLAN_LIMIT_REACHED")
                    setError(
                      `Esta família tem ${result.error.current} de ${result.error.limit} perfis disponíveis na Agenda. Gerencie sua assinatura na Minha conta.`,
                    );
                  else
                    setError(
                      "Não foi possível adicionar esta criança. Ela pode já ter uma Agenda ou seu acesso ter mudado.",
                    );
                  return;
                }
              }
              toast.success(
                profile ? "Dados escolares atualizados" : "Criança adicionada à Agenda",
              );
              onOpenChange(false);
              router.refresh();
            });
          }}
        >
          {!profile && (
            <label className="grid gap-2 font-semibold" htmlFor={`${fieldId}-person`}>
              Criança
              <select
                id={`${fieldId}-person`}
                required
                value={personId}
                onChange={(event) => setPersonId(event.target.value)}
                disabled={!choices || submitting}
                className="min-h-11 rounded-lg border bg-background px-3"
              >
                <option value="">{choices ? "Escolha uma criança" : "Carregando crianças…"}</option>
                {choices?.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {!profile && choices?.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Todas as crianças disponíveis já estão na Agenda. Para adicionar outra, cadastre-a na
              Minha conta.
            </p>
          )}
          <label className="grid gap-2 text-sm font-semibold" htmlFor={`${fieldId}-birth`}>
            Data de nascimento (opcional)
            <Input
              id={`${fieldId}-birth`}
              type="date"
              value={birthDate}
              max={todayLocalIso()}
              onChange={(event) => setBirthDate(event.target.value)}
              disabled={submitting}
            />
          </label>
          <Link className="text-sm font-semibold underline" href="/settings/account">
            Gerenciar pessoas na Minha conta
          </Link>
          {error && (
            <div role="alert" className="grid gap-2 text-sm text-destructive-ink">
              <p>{error}</p>
              {!profile && !choices && (
                <Button type="button" variant="outline" onClick={() => void loadChoices()}>
                  Tentar carregar novamente
                </Button>
              )}
            </div>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting || (!profile && !personId)}>
              {submitting ? "Salvando…" : profile ? "Salvar dados escolares" : "Adicionar à Agenda"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
