"use client";

import { Button } from "@informach/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@informach/ui/components/dropdown-menu";
import { GraduationCap, Hand, MoreVertical, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { formatTurmaShort } from "@/features/turmas/utils";
import type { StudentProfileWithActiveTurma } from "../types";
import { getAgeFromBirthDate } from "../utils";
import { DeleteStudentDialog } from "./delete-student-dialog";
import { StudentAvatar } from "./student-avatar";
import { StudentFormDialog } from "./student-form-dialog";

type Props = {
  currentUserId: string;
  profile: StudentProfileWithActiveTurma;
  /** "Natação às terças e sábados": no lugar da escola, quando a criança tem extras. */
  extras?: string | null;
  isPro: boolean;
  currentCount: number;
};

const ghost =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-foreground/15 bg-background px-3 text-sm font-bold hover:bg-muted";

/**
 * Uma criança, uma folha: quem é (idade, turma e escola), "A vez de Clara" à
 * vista e as duas coisas que mais mudam a rotina dela, o horário da turma e as
 * atividades extras.
 *
 * Entregar o telefone é ação de todo dia, não configuração: fica à vista, e
 * não dentro do menu de três pontinhos junto de "Excluir". Vale para o titular
 * e para o segundo adulto: quem tem acesso à criança pode passar o aparelho
 * para ela. O horário e as extras são da conta de quem cadastrou (a turma é do
 * titular, ver o guia do app), então o adulto convidado vê as atividades.
 */
export function StudentCard({ profile, extras = null, isPro, currentCount, currentUserId }: Props) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const isOwner = profile.userId === currentUserId;

  const age = profile.birthDate ? getAgeFromBirthDate(profile.birthDate) : null;
  const facts = [
    age === null ? null : `${age} ${age === 1 ? "ano" : "anos"}`,
    profile.activeTurma ? formatTurmaShort(profile.activeTurma) : "Sem turma vinculada",
  ].filter(Boolean);

  return (
    <>
      <article
        aria-labelledby={`crianca-${profile.id}`}
        className="space-y-3.5 rounded-[20px] border border-foreground/15 bg-background p-[18px]"
      >
        <div className="flex items-center gap-3.5">
          <StudentAvatar name={profile.name} size="lg" className="shrink-0" />
          <div className="min-w-0 flex-1">
            <h2 id={`crianca-${profile.id}`} className="truncate text-xl font-bold">
              {profile.name}
            </h2>
            {/* A segunda linha é o que muda a semana: as extras quando há,
                a escola quando não, como nas duas folhas da prancha. */}
            <p className="text-sm leading-[1.4] text-muted-foreground">
              {facts.join(" · ")}
              {extras || profile.activeTurma ? (
                <span className="block truncate">{extras ?? profile.activeTurma?.schoolName}</span>
              ) : null}
            </p>
          </div>
          {isOwner ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-11 shrink-0"
                  aria-label={`Ações para ${profile.name}`}
                >
                  <MoreVertical className="size-5" aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link href={`/familia/turmas?perfil=${profile.id}`}>
                    <GraduationCap className="mr-2 size-4" aria-hidden />
                    Gerenciar turmas
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setEditOpen(true)}>
                  <Pencil className="mr-2 size-4" aria-hidden />
                  Editar
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => setDeleteOpen(true)}
                  className="text-destructive-ink focus:text-destructive-ink"
                >
                  <Trash2 className="mr-2 size-4" aria-hidden />
                  Excluir
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>

        <Link
          href={`/crianca/${profile.id}`}
          className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-primary/35 bg-primary/5 px-3 text-[15px] font-bold hover:bg-primary/10"
        >
          <Hand className="size-5" aria-hidden />A vez de {profile.name}
        </Link>

        {isOwner ? (
          <div className="grid grid-cols-2 gap-2">
            <Link
              href={
                profile.activeTurma
                  ? `/turmas/${profile.activeTurma.id}/materias`
                  : `/familia/turmas?perfil=${profile.id}`
              }
              className={ghost}
            >
              {profile.activeTurma ? "Horário da turma" : "Vincular a turma"}
            </Link>
            <Link href={`/perfis/${profile.id}/extras`} className={ghost}>
              Atividades extras
            </Link>
          </div>
        ) : (
          <Link href={`/atividades?perfil=${profile.id}`} className={`${ghost} w-full`}>
            Ver as atividades
          </Link>
        )}
      </article>

      {isOwner ? (
        <>
          <StudentFormDialog
            open={editOpen}
            onOpenChange={setEditOpen}
            isPro={isPro}
            currentCount={currentCount}
            profile={profile}
          />
          <DeleteStudentDialog
            open={deleteOpen}
            onOpenChange={setDeleteOpen}
            profileId={profile.id}
            profileName={profile.name}
          />
        </>
      ) : null}
    </>
  );
}
