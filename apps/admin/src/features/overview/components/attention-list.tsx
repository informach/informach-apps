import { ExternalLink } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Empty, SectionTitle } from "@/components/blocks";
import { ToneIcon } from "@/components/status";
import type { AttentionItem } from "../logic";

const ROW: Record<AttentionItem["tone"], string> = {
  bad: "bg-bad-row",
  warn: "bg-warn-row",
  info: "",
};

function Row({ item, children }: { item: AttentionItem; children: ReactNode }) {
  const className = `flex items-start gap-3.5 rounded-xl px-3 py-3.5 text-ink no-underline ${ROW[item.tone]}`;
  if (!item.href) return <div className={className}>{children}</div>;
  if (item.external)
    return (
      <a
        href={item.href}
        target="_blank"
        rel="noreferrer"
        className={`${className} hover:underline`}
      >
        {children}
        <ExternalLink aria-hidden="true" className="mt-1 size-4 shrink-0 text-ink-muted" />
        <span className="sr-only">(abre fora do Bastidores)</span>
      </a>
    );
  return (
    <Link href={item.href as Route} className={`${className} hover:underline`}>
      {children}
    </Link>
  );
}

/** "Precisa de você", em ordem de urgência. Cada linha diz o que houve e o próximo passo. */
export function AttentionList({ items }: { items: AttentionItem[] }) {
  return (
    <section
      aria-labelledby="atencao"
      className="grid min-w-0 flex-[1_1_420px] content-start gap-3 rounded-[18px] border border-line-warm bg-surface p-5"
    >
      <SectionTitle id="atencao" aside="em ordem de urgência">
        Precisa de você
      </SectionTitle>
      {items.length === 0 ? (
        <Empty>
          Nada pede atenção agora. Os serviços respondem e nenhum aviso ficou para trás.
        </Empty>
      ) : (
        <ul className="m-0 grid list-none gap-1 p-0">
          {items.map((item) => (
            <li key={item.id}>
              <Row item={item}>
                <span className="pt-0.5">
                  <ToneIcon tone={item.tone} />
                </span>
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <strong>{item.title}</strong>
                  {item.detail ? (
                    <span className="text-sm text-ink-soft">{item.detail}</span>
                  ) : null}
                </span>
              </Row>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
