import Link from "next/link";
import { SectionTitle } from "@/components/blocks";
import { StatusPill, type Tone } from "@/components/status";
import type { ServiceCard } from "../service";

const STATE: Record<ServiceCard["state"], { tone: Tone; label: string }> = {
  up: { tone: "ok", label: "No ar" },
  slow: { tone: "warn", label: "Lento" },
  down: { tone: "bad", label: "Fora do ar" },
};

/** "No ar agora": os cinco serviços, cada um com situação, versão ou o problema. */
export function ServicesNow({ services }: { services: ServiceCard[] }) {
  return (
    <section aria-labelledby="agora" className="grid gap-3">
      <SectionTitle id="agora">No ar agora</SectionTitle>
      <ul className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-2.5 p-0">
        {services.map((service) => {
          const state = STATE[service.state];
          return (
            <li key={service.key}>
              <Link
                href="/operacao"
                className={`grid min-h-full gap-2 rounded-[14px] bg-surface p-4 text-ink no-underline hover:border-ink ${
                  service.state === "down" ? "border-[1.5px] border-bad" : "border border-line-warm"
                }`}
              >
                <span className="flex items-center justify-between gap-2">
                  <strong>{service.name}</strong>
                  <StatusPill tone={state.tone}>{state.label}</StatusPill>
                </span>
                <span
                  className={
                    service.state === "up"
                      ? "tabular font-mono text-xs text-ink-muted"
                      : "text-[13px] text-ink-soft"
                  }
                >
                  {service.line}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
