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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@informach/ui/components/select";
import { toast } from "@informach/ui/components/sonner";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";
import { useForm } from "react-hook-form";
import type { StudentProfile } from "@/features/students/types";
import { catchActionResult, isActionRejected } from "@/lib/action-result";
import { joinTurmaByCodeAction } from "../actions";
import { TURMA_CODE_LENGTH } from "../limits";
import { type JoinByCodeFormValues, joinByCodeInputSchema } from "../schemas";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profiles: StudentProfile[];
  defaultProfileId?: string;
};

export function JoinByCodeDialog({ open, onOpenChange, profiles, defaultProfileId }: Props) {
  const router = useRouter();
  const [submitting, startSubmit] = useTransition();

  const form = useForm<JoinByCodeFormValues>({
    resolver: zodResolver(joinByCodeInputSchema),
    defaultValues: {
      code: "",
      profileId: defaultProfileId ?? profiles[0]?.id ?? "",
    },
  });

  // Reset apenas em transições closed→open — evita que `router.refresh()` no
  // parent zere o que o usuário está digitando (refs de `profiles`/`defaultProfileId` mudam).
  // biome-ignore lint/correctness/useExhaustiveDependencies: see comment above
  useEffect(() => {
    if (!open) return;
    form.reset({
      code: "",
      profileId: defaultProfileId ?? profiles[0]?.id ?? "",
    });
  }, [open]);

  const onSubmit = form.handleSubmit((values) => {
    startSubmit(async () => {
      const result = await catchActionResult(() => joinTurmaByCodeAction(values));
      if (!result.ok) {
        if (isActionRejected(result.error)) {
          toast.error("Não foi possível entrar na turma.", {
            description: "Atualize a página e tente novamente.",
          });
          router.refresh();
          return;
        }
        if (result.error.code === "TURMA_NOT_FOUND") {
          toast.error("Código não encontrado", {
            description: "Confira o código com quem te enviou.",
          });
          return;
        }
        if (result.error.code === "PROFILE_NOT_FOUND") {
          toast.error("Perfil não encontrado");
          return;
        }
        toast.error("Não foi possível entrar na turma.");
        return;
      }
      toast.success("Você entrou na turma");
      onOpenChange(false);
      router.refresh();
    });
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Entrar com código</DialogTitle>
          <DialogDescription>
            Digite o código que algum responsável daquela turma te enviou.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={onSubmit} className="space-y-4">
            <FormField
              control={form.control}
              name="profileId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Estudante</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione um perfil" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {profiles.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Código da turma</FormLabel>
                  <FormControl>
                    <Input
                      autoFocus
                      autoComplete="off"
                      maxLength={TURMA_CODE_LENGTH}
                      placeholder="HKPR47MTXW29"
                      className="font-mono uppercase tracking-widest"
                      {...field}
                      onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden /> : null}
                Entrar
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
