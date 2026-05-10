"use client";

import { Badge } from "@informach/ui/components/badge";
import { Button } from "@informach/ui/components/button";
import { Card, CardContent } from "@informach/ui/components/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@informach/ui/components/dropdown-menu";
import { toast } from "@informach/ui/components/sonner";
import { BookOpen, Copy, LogOut, MoreVertical, Star, UserPlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { StudentProfile } from "@/features/students/types";
import { catchActionResult, isActionRejected } from "@/lib/action-result";
import { joinTurmaByCodeAction, leaveTurmaAction, setActiveTurmaAction } from "../actions";
import type { TurmaForUser } from "../types";
import { formatTurmaShort } from "../utils";

type Props = {
  turma: TurmaForUser;
  userProfiles: StudentProfile[];
};

export function TurmaCard({ turma, userProfiles }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();

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

  const anyActive = turma.members.some((m) => m.isActive);
  const isEmpty = turma.members.length === 0;

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-0.5">
            <div className="flex items-center gap-2">
              <p className="truncate text-base font-semibold text-foreground">{turma.schoolName}</p>
              {anyActive ? (
                <Badge className="border border-chart-2/40 bg-chart-2/15 text-foreground">
                  Ativa
                </Badge>
              ) : null}
            </div>
            <p className="text-sm text-muted-foreground">
              {formatTurmaShort(turma)} · {turma.year} · {turma.cityName}/{turma.stateUf}
            </p>
          </div>
          <div className="flex items-center gap-2">
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
                      size="icon"
                      aria-label={`Ações para ${member.profileName}`}
                    >
                      <MoreVertical className="size-4" aria-hidden />
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
    </Card>
  );
}
