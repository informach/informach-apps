import { ArrowUpRight, Clock } from "lucide-react";
import { APPS } from "@/lib/apps";

export function AppsShowcase() {
  return (
    <section id="apps" className="border-b border-border/40 bg-muted/30">
      <div className="container mx-auto px-4 py-20 md:py-24">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-medium uppercase tracking-wider text-secondary">Nossos apps</p>
          <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight md:text-4xl">
            Soluções prontas, pra usar agora.
          </h2>
          <p className="mt-4 text-balance text-base leading-relaxed text-muted-foreground md:text-lg">
            Cada um resolve uma dor específica. Sem enrolação, sem onboarding de 40 passos, sem
            jargão técnico.
          </p>
        </div>

        <div className="mt-14 grid gap-6 md:grid-cols-2">
          {APPS.map((app) => (
            <a
              key={app.slug}
              href={app.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex flex-col gap-4 rounded-2xl border border-border/60 bg-card p-7 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {app.audience}
                  </p>
                  <h3 className="mt-2 text-2xl font-semibold tracking-tight">{app.name}</h3>
                  <p className="mt-1 text-sm font-medium text-secondary">{app.tagline}</p>
                </div>
                <ArrowUpRight
                  className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground"
                  aria-hidden
                />
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">{app.description}</p>
              <div className="mt-auto flex items-center gap-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-success/15 px-2.5 py-1 font-medium text-success">
                  <span className="size-1.5 rounded-full bg-success" aria-hidden />
                  Disponível
                </span>
                <span className="text-muted-foreground" aria-hidden>
                  ·
                </span>
                <span className="text-muted-foreground">{app.url.replace("https://", "")}</span>
              </div>
            </a>
          ))}

          <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border/60 bg-background/40 p-7 text-center">
            <Clock className="size-5 text-muted-foreground" aria-hidden />
            <p className="text-sm font-medium text-muted-foreground">Mais apps em breve</p>
            <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">
              Estamos sempre testando novas dores pra resolver. Quer ser avisado? Entra na
              comunidade.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
