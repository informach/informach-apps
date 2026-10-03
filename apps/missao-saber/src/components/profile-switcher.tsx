"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@informach/ui/components/dialog";
import { cn } from "@informach/ui/lib/utils";
import { ChevronsUpDown } from "lucide-react";
import { useState } from "react";
import { gradeLabel } from "@/features/family/school-year";
import { flushPendingLabs } from "@/features/labs/runtime/pending-work";
import { selectProfileAction } from "@/features/learning/actions";
import { announceContextChange } from "@/features/study-access/context-change";
import { useServerAction } from "@/lib/use-server-action";
import { Avatar } from "./avatares";

type Perfil = { id: string; nickname: string; avatar: string; grade: number };

/**
 * Troca de estudante.
 *
 * O `avatar` do perfil já existia no banco desde o começo e nunca era
 * mostrado; aqui ele finalmente vira a identidade do estudante. Com um
 * único perfil o controle não é interativo — não há o que trocar.
 */
export function ProfileSwitcher({ profiles, selected }: { profiles: Perfil[]; selected?: string }) {
  const [aberto, setAberto] = useState(false);
  const [pending, start] = useServerAction();
  const [error, setError] = useState("");
  if (!profiles.length) return null;
  const atual = profiles.find((p) => p.id === selected) ?? profiles[0];
  if (!atual) return null;

  if (profiles.length === 1)
    return (
      <span className="flex min-w-0 items-center gap-2.5 rounded-full border-2 border-sombra bg-creme py-1.5 pr-4 pl-1.5">
        <Avatar id={atual.avatar} tamanho="pp" />
        <span className="truncate font-display font-semibold text-tinta" title={atual.nickname}>
          {atual.nickname}
        </span>
      </span>
    );

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={`Trocar de estudante. Agora: ${atual.nickname}`}
          className="flex min-w-0 items-center gap-2.5 rounded-full border-2 border-sombra bg-creme py-1.5 pr-3 pl-1.5 shadow-chapa-sm transition-transform duration-100 active:translate-y-0.5 active:shadow-none"
        >
          <Avatar id={atual.avatar} tamanho="pp" />
          <span className="truncate font-display font-semibold text-tinta">{atual.nickname}</span>
          <ChevronsUpDown size={16} aria-hidden="true" className="shrink-0 text-tinta-suave" />
        </button>
      </DialogTrigger>
      <DialogContent className="rounded-card border-2 border-sombra bg-papel sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Quem vai explorar?</DialogTitle>
          <DialogDescription>
            Cada estudante tem o próprio caminho, o próprio caderno e as próprias descobertas.
          </DialogDescription>
        </DialogHeader>
        <ul className="grid gap-3 sm:grid-cols-2">
          {profiles.map((p) => {
            const eAtual = p.id === atual.id;
            return (
              <li key={p.id}>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      setError("");
                      try {
                        if (!(await flushPendingLabs())) {
                          setError(
                            "Salve sua investigação ou guarde uma cópia antes de trocar de estudante.",
                          );
                          return;
                        }
                        const result = await selectProfileAction(p.id);
                        if (result.ok) {
                          setAberto(false);
                          announceContextChange("/hoje");
                          window.location.assign("/hoje");
                        } else setError(result.error);
                      } catch {
                        setError("Não foi possível trocar de perfil.");
                      }
                    })
                  }
                  className={cn(
                    "flex w-full min-h-20 items-center gap-3.5 rounded-card border-2 p-3 text-left transition-transform duration-100",
                    "active:translate-y-1 active:shadow-none disabled:opacity-60",
                    eAtual
                      ? "border-verde-fundo bg-verde-claro shadow-[0_4px_0_var(--ms-verde-fundo)]"
                      : "border-sombra bg-creme shadow-chapa hover:border-verde/60",
                  )}
                >
                  <Avatar id={p.avatar} tamanho="m" />
                  <span className="min-w-0">
                    <span className="block font-display text-lg font-semibold wrap-anywhere text-tinta">
                      {p.nickname}
                    </span>
                    <span className="block text-sm text-tinta-suave">
                      {gradeLabel(p.grade)}
                      {eAtual ? " · explorando agora" : ""}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {error && (
          <p role="alert" className="text-sm font-semibold text-coral-solido">
            {error}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
