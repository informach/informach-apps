"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@informach/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@informach/ui/components/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@informach/ui/components/form";
import { Input } from "@informach/ui/components/input";
import { toast } from "@informach/ui/components/sonner";
import { Loader2, Lock } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";
import { useForm } from "react-hook-form";
import { todayLocalIso } from "@/features/dashboard/date";
import { catchActionResult, isActionRejected } from "@/lib/action-result";
import { createStudentProfileAction, updateStudentProfileAction } from "../actions";
import { FREE_STUDENT_PROFILE_LIMIT, PRO_STUDENT_PROFILE_LIMIT } from "../limits";
import { createStudentProfileInputSchema, type StudentProfileFormValues } from "../schemas";
import type { StudentProfile } from "../types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isPro: boolean;
  currentCount: number;
  profile?: StudentProfile;
};

const EMPTY_DEFAULTS: StudentProfileFormValues = {
  name: "",
  birthDate: "",
};

function defaultsFromProfile(profile: StudentProfile): StudentProfileFormValues {
  return {
    name: profile.name,
    birthDate: profile.birthDate ?? "",
  };
}

export function StudentFormDialog({ open, onOpenChange, isPro, currentCount, profile }: Props) {
  const router = useRouter();
  const [submitting, startSubmit] = useTransition();
  const isEdit = profile !== undefined;
  const proLimit = PRO_STUDENT_PROFILE_LIMIT;
  const limitReached =
    !isEdit &&
    ((isPro && currentCount >= proLimit) || (!isPro && currentCount >= FREE_STUDENT_PROFILE_LIMIT));

  const initialDefaults = profile ? defaultsFromProfile(profile) : EMPTY_DEFAULTS;

  const form = useForm<StudentProfileFormValues>({
    resolver: zodResolver(createStudentProfileInputSchema),
    defaultValues: initialDefaults,
  });

  // Reset apenas em transições closed→open. `profile` ref pode mudar quando o
  // parent re-renderiza após `router.refresh()`, o que zeraria o que o usuário
  // está digitando.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see comment above
  useEffect(() => {
    if (!open) return;
    form.reset(profile ? defaultsFromProfile(profile) : EMPTY_DEFAULTS);
  }, [open]);

  const onSubmit = form.handleSubmit((values) => {
    startSubmit(async () => {
      if (isEdit && profile) {
        const result = await catchActionResult(() =>
          updateStudentProfileAction({ id: profile.id, ...values }),
        );
        if (!result.ok) {
          if (isActionRejected(result.error)) {
            toast.error("Não foi possível salvar.", {
              description: "Atualize a página e tente novamente.",
            });
            router.refresh();
            return;
          }
          if (result.error.code === "NOT_FOUND") {
            toast.error("Não achamos essa criança", {
              description: "Pode ter sido removido em outra aba.",
            });
            onOpenChange(false);
            router.refresh();
            return;
          }
          toast.error("Não foi possível salvar.", {
            description: "Tente novamente em instantes.",
          });
          return;
        }
        toast.success("Dados atualizados");
        onOpenChange(false);
        router.refresh();
        return;
      }

      const result = await catchActionResult(() => createStudentProfileAction(values));
      if (!result.ok) {
        if (isActionRejected(result.error)) {
          toast.error("Não foi possível adicionar a criança.", {
            description: "Atualize a página e tente novamente.",
          });
          router.refresh();
          return;
        }
        if (result.error.code === "PLAN_LIMIT_REACHED") {
          if (!result.error.isPro) {
            toast.error("O plano grátis tem uma criança", {
              description: `No Pro cabem até ${proLimit} crianças, cada uma com a sua turma e o seu horário.`,
              action: { label: "Ver planos", onClick: () => router.push("/upgrade") },
            });
          } else {
            toast.error("Limite de perfis atingido", {
              description: `Você já tem ${result.error.current} de ${result.error.limit} perfis no plano Pro.`,
            });
          }
          return;
        }
        toast.error("Não foi possível adicionar a criança.", {
          description: "Tente novamente em instantes.",
        });
        return;
      }
      toast.success("Criança adicionada");
      form.reset(EMPTY_DEFAULTS);
      onOpenChange(false);
      router.refresh();
    });
  });

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      form.reset(profile ? defaultsFromProfile(profile) : EMPTY_DEFAULTS);
    }
    onOpenChange(next);
  };

  const todayIso = todayLocalIso();

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar dados da criança" : "Adicionar criança"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Atualize o nome ou a data de nascimento."
              : "Só o nome basta. Escola, turma e horário podem vir depois."}
          </DialogDescription>
        </DialogHeader>

        {limitReached ? (
          <div className="space-y-4">
            <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-muted/40 p-6 text-center">
              <span className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary-ink">
                <Lock className="size-5" aria-hidden />
              </span>
              <div className="space-y-1">
                <p className="text-base font-semibold text-foreground">
                  {isPro ? "Já são três crianças" : "O plano grátis tem uma criança"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {isPro
                    ? `Plano Pro permite até ${proLimit} perfis.`
                    : `No Pro cabem até ${proLimit} crianças, cada uma com a sua turma e o seu horário.`}
                </p>
              </div>
              {isPro ? null : (
                <Button asChild>
                  <Link href="/upgrade">Conhecer o Pro</Link>
                </Button>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                Fechar
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={onSubmit} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome</FormLabel>
                    <FormControl>
                      <Input autoFocus placeholder="Ex: Helena" autoComplete="off" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="birthDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Data de nascimento (opcional)</FormLabel>
                    <FormControl>
                      <Input type="date" max={todayIso} {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleOpenChange(false)}
                  disabled={submitting}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden /> : null}
                  {isEdit ? "Salvar" : "Adicionar criança"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
