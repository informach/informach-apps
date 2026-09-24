"use client";

import { Button } from "@informach/ui/components/button";
import { MessagesSquare } from "lucide-react";
import { useMemo, useState } from "react";
import type { WhatsAppMessage } from "../whatsapp-export";

/**
 * Escolher, numa conversa exportada, as mensagens que são recado.
 *
 * O grupo da turma tem duzentas mensagens sobre outra coisa. Mandar tudo para a
 * leitura seria caro, impreciso e indiscreto — a conversa inteira contém coisas
 * de outras famílias. Só o que a pessoa marcar sai daqui.
 */
export const MAX_PICKED_MESSAGES = 10;

export function WhatsAppPicker({
  messages,
  onUse,
  onCancel,
  busy,
}: {
  messages: WhatsAppMessage[];
  onUse: (picked: WhatsAppMessage[]) => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  // As mais recentes primeiro: o recado que interessa quase sempre é o último.
  const ordered = useMemo(() => [...messages].reverse(), [messages]);
  const [picked, setPicked] = useState<Set<number>>(new Set());

  const toggle = (index: number) =>
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else if (next.size < MAX_PICKED_MESSAGES) next.add(index);
      return next;
    });

  return (
    <section className="space-y-4 rounded-xl border bg-card p-5">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-chart-2/15 text-chart-2-ink">
          <MessagesSquare className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="font-semibold">Escolha as mensagens do recado</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {messages.length} mensagens na conversa. Marque até {MAX_PICKED_MESSAGES}; só as
            marcadas são enviadas para a leitura.
          </p>
        </div>
      </div>
      <ul className="max-h-96 space-y-2 overflow-y-auto pr-1">
        {ordered.map((message, index) => {
          const checked = picked.has(index);
          return (
            <li key={`${message.dateIso ?? "sem-data"}-${message.time ?? index}-${index}`}>
              <label
                className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm ${
                  checked ? "border-primary/40 bg-primary/5" : "bg-background"
                }`}
              >
                <input
                  type="checkbox"
                  className="mt-1 size-4 shrink-0"
                  checked={checked}
                  disabled={!checked && picked.size >= MAX_PICKED_MESSAGES}
                  onChange={() => toggle(index)}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-xs text-muted-foreground">
                    {[message.dateIso?.split("-").reverse().join("/"), message.time, message.author]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  <span className="mt-0.5 block whitespace-pre-wrap break-words">
                    {message.text.length > 400 ? `${message.text.slice(0, 400)}…` : message.text}
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap gap-3">
        <Button
          disabled={busy || picked.size === 0}
          // De volta à ordem da conversa: a retificação de quarta precisa ser
          // lida DEPOIS do recado de segunda que ela corrige.
          onClick={() => onUse([...picked].sort((a, b) => b - a).map((i) => ordered[i]!))}
        >
          Usar {picked.size === 1 ? "1 mensagem" : `${picked.size} mensagens`}
        </Button>
        <Button variant="ghost" disabled={busy} onClick={onCancel}>
          Escolher outro arquivo
        </Button>
      </div>
    </section>
  );
}
