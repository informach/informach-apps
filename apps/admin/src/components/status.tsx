import { CircleCheck, CircleDot, Info, OctagonX, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

export type Tone = "ok" | "warn" | "bad" | "info" | "muted";

const TONE: Record<Tone, { className: string; Icon: typeof CircleCheck }> = {
  ok: { className: "bg-ok-wash text-ok", Icon: CircleCheck },
  warn: { className: "bg-warn-wash text-warn", Icon: TriangleAlert },
  bad: { className: "bg-bad-wash text-bad", Icon: OctagonX },
  info: { className: "bg-info-wash text-info", Icon: Info },
  muted: { className: "bg-sand text-ink-soft", Icon: CircleDot },
};

/** Situação com ícone e palavra, nunca só cor. */
export function StatusPill({ tone, children }: { tone: Tone; children: ReactNode }) {
  const { className, Icon } = TONE[tone];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[13px] font-bold ${className}`}
    >
      <Icon aria-hidden="true" className="size-3.5" strokeWidth={2.2} />
      {children}
    </span>
  );
}

export function ToneIcon({ tone, className = "size-5" }: { tone: Tone; className?: string }) {
  const { Icon } = TONE[tone];
  const color = {
    ok: "text-ok",
    warn: "text-warn",
    bad: "text-bad",
    info: "text-info",
    muted: "text-ink-muted",
  }[tone];
  return <Icon aria-hidden="true" className={`${className} ${color}`} strokeWidth={2.2} />;
}
