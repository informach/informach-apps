"use client";

import { Badge } from "@informach/ui/components/badge";
import { Button } from "@informach/ui/components/button";
import { Card, CardContent } from "@informach/ui/components/card";
import { BookOpen, Camera, Mic, Plus } from "lucide-react";
import { useState } from "react";
import type { Subject } from "../types";
import { SubjectCard } from "./subject-card";
import { SubjectFormDialog } from "./subject-form-dialog";
import {
  type ParsedSubjectInput,
  SubjectsBatchConfirmDialog,
} from "./subjects-batch-confirm-dialog";
import { SubjectsImageDialog } from "./subjects-image-dialog";
import { SubjectsVoiceDialog } from "./subjects-voice-dialog";

type Props = {
  subjects: Subject[];
  turmaId: string;
  currentUserId: string;
  canCreateSubject: boolean;
  /**
   * Quando true, os botões de IA (voz/imagem) ficam clicáveis. Quando false,
   * permanecem visíveis mas desabilitados com badge "Pro" — mesmo padrão do
   * `ExportPdfButton` do dashboard. Server-side guard em `withAiRouteGuards`
   * é defesa em camadas.
   */
  isPro: boolean;
};

export function SubjectsSection({
  subjects,
  turmaId,
  currentUserId,
  canCreateSubject,
  isPro,
}: Props) {
  const [createOpen, setCreateOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [imageOpen, setImageOpen] = useState(false);
  const [batchInitial, setBatchInitial] = useState<ParsedSubjectInput[] | null>(null);

  // Quando a IA termina de processar (voz ou imagem) e devolve a lista, fecha
  // o dialog de origem ANTES de abrir o de confirmação. Sem isso o voice
  // dialog (ou image) fica aberto por baixo da modal de confirmar.
  const handleParsed = (parsed: ParsedSubjectInput[]) => {
    setVoiceOpen(false);
    setImageOpen(false);
    setBatchInitial(parsed);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {subjects.length === 0
            ? "Nenhuma matéria cadastrada nesta turma."
            : `${subjects.length} ${subjects.length === 1 ? "matéria" : "matérias"} cadastrada${subjects.length === 1 ? "" : "s"}.`}
        </p>
        {canCreateSubject ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 size-4" aria-hidden />
              Nova matéria
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setVoiceOpen(true)}
              disabled={!isPro}
            >
              <Mic className="mr-2 size-4" aria-hidden />
              Por voz
              {!isPro ? (
                <Badge variant="secondary" className="ml-2">
                  Pro
                </Badge>
              ) : null}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setImageOpen(true)}
              disabled={!isPro}
            >
              <Camera className="mr-2 size-4" aria-hidden />
              Por imagem
              {!isPro ? (
                <Badge variant="secondary" className="ml-2">
                  Pro
                </Badge>
              ) : null}
            </Button>
          </div>
        ) : null}
      </div>

      {subjects.length === 0 ? (
        <Card className="rounded-2xl border-dashed">
          <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <BookOpen className="size-6" aria-hidden />
            </span>
            <div className="space-y-1">
              <p className="text-base font-semibold text-foreground">
                {canCreateSubject
                  ? "Cadastre as matérias da turma"
                  : "Esta turma ainda não tem matérias"}
              </p>
              <p className="text-sm text-muted-foreground">
                {canCreateSubject
                  ? "Qualquer pessoa da turma pode adicionar matérias. Você só edita/exclui as que criou."
                  : "Aguarde alguém da turma cadastrar as matérias."}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {subjects.map((subject) => (
            <SubjectCard
              key={subject.id}
              subject={subject}
              turmaId={turmaId}
              currentUserId={currentUserId}
            />
          ))}
        </div>
      )}

      {canCreateSubject ? (
        <>
          <SubjectFormDialog open={createOpen} onOpenChange={setCreateOpen} turmaId={turmaId} />
          {isPro ? (
            <>
              <SubjectsVoiceDialog
                open={voiceOpen}
                onOpenChange={setVoiceOpen}
                onParsed={handleParsed}
              />
              <SubjectsImageDialog
                open={imageOpen}
                onOpenChange={setImageOpen}
                onParsed={handleParsed}
              />
              <SubjectsBatchConfirmDialog
                open={batchInitial !== null}
                onOpenChange={(o) => {
                  if (!o) setBatchInitial(null);
                }}
                turmaId={turmaId}
                initialSubjects={batchInitial ?? []}
              />
            </>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
