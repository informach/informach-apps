import { BackButton } from "@/components/app-shell/back-button";

/** Casco comum das três fontes de detalhe, para que a página não mude de forma conforme a origem. */
export function ActivityDetailShell({
  profileName,
  title,
  meta,
  children,
}: {
  profileName: string;
  title: string;
  /** Linha discreta acima do título: versão, turma, matéria. */
  meta?: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8 pb-28 sm:px-8">
      <div className="flex items-start gap-2">
        <BackButton href="/atividades" label="Voltar às atividades" />
        <div className="min-w-0 space-y-1">
          <p className="text-sm text-muted-foreground">
            {profileName}
            {meta ? ` · ${meta}` : ""}
          </p>
          <h1 className="break-words text-2xl font-semibold tracking-tight">{title}</h1>
        </div>
      </div>
      {children}
    </main>
  );
}
