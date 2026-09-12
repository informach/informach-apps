"use client";

import { Badge } from "@informach/ui/components/badge";
import { Button } from "@informach/ui/components/button";
import { Card, CardContent } from "@informach/ui/components/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@informach/ui/components/dropdown-menu";
import { toast } from "@informach/ui/components/sonner";
import { BookOpen, Copy, LogOut, MoreVertical, Pencil, Star, Trash2, UserPlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { StudentProfile } from "@/features/students/types";
import { catchActionResult, isActionRejected } from "@/lib/action-result";
import { joinTurmaByCodeAction, leaveTurmaAction, setActiveTurmaAction } from "../actions";
import type { TurmaForUser } from "../types";
import { formatTurmaShort } from "../utils";
import { DeleteTurmaDialog } from "./delete-turma-dialog";
import { EditTurmaDialog } from "./edit-turma-dialog";

type Props = {
  turma: TurmaForUser;
  userProfiles: StudentProfile[];
  currentUserId: string;
};

export function TurmaCard({ turma, userProfiles, currentUserId }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const isCreator = turma.createdByUserId === currentUserId;
  // Edit/Apagar compartilham o mesmo gate: turma só pode ser editada/apagada
  // enquanto está "fresca" (sem atividades e sem outras famílias). Service
  // revalida — UI usa esses flags só pra esconder/disabilitar de antemão.
  const isFrozen = turma.hasActivities || turma.hasOtherFamilies;
  const frozenReason = turma.hasActivities
    ? "Há atividades cadastradas"
    : turma.hasOtherFamilies
      ? "Outra família vinculada"
      : null;

  const memberProfileIds = new Set(turma.members.map((m) => m.profileId));
  const linkableProfiles = userProfiles.filter((p) => !memberProfileIds.has(p.id));

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(turma.code);
      toast.success("Código copiado");
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  const handleSetActive = (profileId: string) => {
    startTransition(async () => {
      const result = await catchActionResult(() =>
        setActiveTurmaAction({ profileId, turmaId: turma.id }),
      );
      if (!result.ok) {
        if (isActionRejected(result.error)) {
          toast.error("Não foi possível atualizar.");
          router.refresh();
          return;
        }
        toast.error("Não foi possível atualizar.");
        return;
      }
      toast.success("Turma ativa atualizada");
      router.refresh();
    });
  };

  const handleLeave = (profileId: string, profileName: string) => {
    startTransition(async () => {
      const result = await catchActionResult(() =>
        leaveTurmaAction({ profileId, turmaId: turma.id }),
      );
      if (!result.ok) {
        if (isActionRejected(result.error)) {
          toast.error("Não foi possível sair da turma.");
          router.refresh();
          return;
        }
        toast.error("Não foi possível sair da turma.");
        return;
      }
      toast.success(`${profileName} saiu da turma`);
      router.refresh();
    });
  };

  const handleJoin = (profileId: string, profileName: string) => {
    startTransition(async () => {
      const result = await catchActionResult(() =>
        joinTurmaByCodeAction({ code: turma.code, profileId }),
      );
      if (!result.ok) {
        if (isActionRejected(result.error)) {
          toast.error("Não foi possível vincular.");
          router.refresh();
          return;
        }
        toast.error("Não foi possível vincular.");
        return;
      }
      toast.success(`${profileName} foi vinculada à turma`);
      router.refresh();
    });
  };

  const isEmpty = turma.members.length === 0;

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        {/* Header: title-block + ⋮ sempre top-right (convenção universal de cards) */}
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1 space-y-0.5">
            <p className="truncate text-base font-semibold text-foreground">{turma.schoolName}</p>
            <p className="text-sm text-muted-foreground">
              {formatTurmaShort(turma)} · {turma.year} · {turma.cityName}/{turma.stateUf}
            </p>
          </div>
          {isCreator ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="-mr-2 -mt-1 shrink-0"
                  aria-label={`Ações da turma ${turma.schoolName}`}
                >
                  <MoreVertical className="size-4" aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem disabled={isFrozen} onSelect={() => setEditOpen(true)}>
                  <Pencil className="mr-2 size-4" aria-hidden />
                  <div className="flex flex-col">
                    <span>Editar turma</span>
                    {frozenReason ? (
                      <span className="text-xs text-muted-foreground">{frozenReason}</span>
                    ) : null}
                  </div>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled={isFrozen}
                  onSelect={() => setDeleteOpen(true)}
                  className="text-destructive focus:text-destructive data-[disabled]:text-muted-foreground"
                >
                  <Trash2 className="mr-2 size-4" aria-hidden />
                  <div className="flex flex-col">
                    <span>Apagar turma</span>
                    {frozenReason ? <span className="text-xs">{frozenReason}</span> : null}
                  </div>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>

        {/* Ações de conteúdo: Matérias + Code (compartilham row, flex-wrap pra viewports estreitos) */}
        <div className="flex flex-wrap items-center gap-2">
          {isCreator ? (
            <Button asChild variant="outline" size="sm">
              <Link href={`/turmas/${turma.id}/acesso`}>Gerenciar acesso</Link>
            </Button>
          ) : null}
          <Button asChild variant="outline" size="sm">
            <Link href={`/turmas/${turma.id}/materias`}>
              <BookOpen className="mr-2 size-3.5" aria-hidden />
              Matérias
            </Link>
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={copyCode}>
            <Copy className="mr-2 size-3.5" aria-hidden />
            <span className="font-mono text-xs">{turma.code}</span>
          </Button>
        </div>

        <div className="flex flex-col gap-2 border-t pt-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Estudantes
            </p>
            {linkableProfiles.length > 0 && !isEmpty ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="ghost" size="sm" className="h-7 gap-1.5 text-xs">
                    <UserPlus className="size-3.5" aria-hidden />
                    Vincular
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {linkableProfiles.map((p) => (
                    <DropdownMenuItem key={p.id} onSelect={() => handleJoin(p.id, p.name)}>
                      <UserPlus className="mr-2 size-4" aria-hidden />
                      {p.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>

          {isEmpty ? (
            <div className="rounded-md bg-muted/40 p-3 text-sm text-muted-foreground">
              <p>Nenhum estudante seu vinculado nesta turma.</p>
              {linkableProfiles.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {linkableProfiles.map((p) => (
                    <Button
                      key={p.id}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleJoin(p.id, p.name)}
                    >
                      <UserPlus className="mr-1.5 size-3.5" aria-hidden />
                      Vincular {p.name}
                    </Button>
                  ))}
                </div>
              ) : (
                <p className="mt-1 text-xs">
                  Compartilhe o código com outros responsáveis ou crie um perfil de estudante para
                  vincular.
                </p>
              )}
            </div>
          ) : (
            turma.members.map((member) => (
              <div key={member.profileId} className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm">
                  <span>{member.profileName}</span>
                  {member.isActive ? (
                    <Badge variant="outline" className="border-chart-2/50 text-foreground">
                      <Star className="mr-1 size-3 fill-current text-chart-2" aria-hidden />
                      ativa
                    </Badge>
                  ) : null}
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      className="size-7 text-muted-foreground hover:text-foreground"
                      aria-label={`Ações para ${member.profileName}`}
                    >
                      <MoreVertical className="size-3.5" aria-hidden />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {member.isActive ? null : (
                      <DropdownMenuItem onSelect={() => handleSetActive(member.profileId)}>
                        <Star className="mr-2 size-4" aria-hidden />
                        Marcar como ativa
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      onSelect={() => handleLeave(member.profileId, member.profileName)}
                      className="text-destructive focus:text-destructive"
                    >
                      <LogOut className="mr-2 size-4" aria-hidden />
                      Sair da turma
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))
          )}
        </div>
      </CardContent>

      {isCreator ? (
        <>
          <DeleteTurmaDialog
            open={deleteOpen}
            onOpenChange={setDeleteOpen}
            turmaId={turma.id}
            schoolName={turma.schoolName}
          />
          <EditTurmaDialog open={editOpen} onOpenChange={setEditOpen} turma={turma} />
        </>
      ) : null}
    </Card>
  );
}
