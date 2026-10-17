"use client";
import { Check, Copy } from "lucide-react";
import { useState } from "react";

/** Copia o ID da conta, para colar na auditoria ou num chamado. */
export function CopyId({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={copied ? "ID copiado" : "Copiar o ID"}
      onClick={() => {
        void navigator.clipboard?.writeText(id).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
      }}
      className="inline-grid size-11 place-items-center rounded-lg text-ink-muted hover:bg-sand"
    >
      {copied ? (
        <Check aria-hidden="true" className="size-4 text-ok" />
      ) : (
        <Copy aria-hidden="true" className="size-4" />
      )}
    </button>
  );
}
