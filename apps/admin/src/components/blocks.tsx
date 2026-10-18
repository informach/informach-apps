import type { ReactNode } from "react";

/** Cartão branco das telas. */
export function Panel({
  children,
  className = "",
  as: Tag = "section",
  labelledBy,
}: {
  children: ReactNode;
  className?: string;
  as?: "section" | "div" | "article";
  /** `id` do título que nomeia a seção para leitores de tela. */
  labelledBy?: string;
}) {
  return (
    <Tag
      aria-labelledby={labelledBy}
      className={`grid content-start gap-3 rounded-[18px] border border-line-warm bg-surface p-5 ${className}`}
    >
      {children}
    </Tag>
  );
}

/** Cabeçalho de seção: título e, à direita, uma nota ou um link. */
export function SectionTitle({
  id,
  children,
  aside,
}: {
  id?: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-3">
      <h2 id={id} className="m-0 text-lg font-extrabold">
        {children}
      </h2>
      {aside ? <span className="text-[13px] text-ink-muted">{aside}</span> : null}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="grid gap-1.5">
        <h1 className="m-0 text-[clamp(28px,3vw,38px)] leading-[1.1] font-extrabold tracking-[-0.025em]">
          {title}
        </h1>
        {description ? <p className="m-0 max-w-3xl text-ink-muted">{description}</p> : null}
      </div>
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </header>
  );
}

/** Número grande em mono com legenda, como nos cartões do painel. */
export function Stat({
  value,
  label,
  size = "md",
  className = "",
}: {
  value: ReactNode;
  label: ReactNode;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const text = { sm: "text-lg", md: "text-[22px]", lg: "text-[32px]" }[size];
  return (
    <span className={`grid ${className}`}>
      <strong className={`tabular font-mono leading-tight font-semibold ${text}`}>{value}</strong>
      <span className="text-[13px] opacity-80">{label}</span>
    </span>
  );
}

export function Mono({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`tabular font-mono text-[13px] ${className}`}>{children}</span>;
}

/** O estado vazio fala como gente: "Nada por aqui nos últimos 7 dias." */
export function Empty({ children }: { children: ReactNode }) {
  return <p className="m-0 rounded-xl bg-sand px-4 py-3 text-sm text-ink-soft">{children}</p>;
}

/** Aviso de fonte ou de limite do dado, em linha, abaixo de uma seção. */
export function Note({ children }: { children: ReactNode }) {
  return <p className="m-0 text-[13px] text-ink-muted">{children}</p>;
}
