import { BackButton } from "@/components/app-shell/back-button";

/** Casco do modo de edição: o mesmo formulário, seja qual for a origem da atividade. */
export function ActivityDetailShell({
  profileName,
  title,
  meta,
  backHref,
  children,
}: {
  profileName: string;
  title: string;
  /** Linha discreta acima do título: versão, turma, matéria. */
  meta?: string;
  /** Editar é um passo dentro do detalhe: voltar leva à leitura. */
  backHref: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8 pb-28 sm:px-8">
      <div className="flex items-start gap-2">
        <BackButton href={backHref} label="Voltar para a atividade" />
        <div className="min-w-0 space-y-1">
          <p className="text-sm text-muted-foreground">
            Editando · {profileName}
            {meta ? ` · ${meta}` : ""}
          </p>
          <h1 className="break-words text-2xl font-extrabold tracking-tight">{title}</h1>
        </div>
      </div>
      {children}
    </main>
  );
}
