"use client";
import { Button } from "@informach/ui/components/button";
import { Input } from "@informach/ui/components/input";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { catchActionResult } from "@/lib/action-result";
import { createCalendarFeedAction, revokeCalendarFeedAction } from "../actions";
export function CalendarFeedPanel({ active, enabled }: { active: boolean; enabled: boolean }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <section className="space-y-4 rounded-xl border bg-card p-5 sm:p-6">
      <h2 className="text-lg font-semibold">Sua agenda no calendário pessoal</h2>
      <p className="text-sm text-muted-foreground">
        Adicione o link privado como uma assinatura de calendário no Google Calendar, Apple Calendar
        ou Outlook. Os compromissos são enviados em uma direção; edite na Agenda da Turma. A
        atualização depende do aplicativo e pode levar horas.
      </p>
      <p className="text-sm text-muted-foreground">
        O link permite ler nomes e compromissos das crianças às quais você tem acesso. Guarde-o como
        uma senha. Revogar impede novas consultas; cópias já baixadas precisam ser removidas no
        calendário de destino.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button
          variant="outline"
          disabled={busy || !enabled}
          onClick={async () => {
            setBusy(true);
            const result = await catchActionResult(() => createCalendarFeedAction({}));
            setBusy(false);
            if (result.ok) {
              setUrl(result.value.url);
              setMessage("Novo link criado. Links anteriores foram revogados.");
              router.refresh();
            } else setMessage("Não foi possível criar o link. Confira o plano da família.");
          }}
        >
          {active ? "Gerar novo link e revogar o anterior" : "Criar link privado"}
        </Button>
        {active ? (
          <Button
            variant="ghost"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const result = await catchActionResult(() => revokeCalendarFeedAction({}));
              setBusy(false);
              if (result.ok) {
                setUrl("");
                setMessage("Link revogado.");
                router.refresh();
              }
            }}
          >
            Revogar acesso
          </Button>
        ) : null}
      </div>
      {url ? (
        <div className="space-y-2">
          <Input value={url} readOnly aria-label="Link privado do calendário" />
          <Button
            variant="outline"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(url);
                setMessage("Link copiado. Adicione por URL no calendário de destino.");
              } catch {
                setMessage("Selecione e copie o link acima.");
              }
            }}
          >
            Copiar link
          </Button>
        </div>
      ) : null}
      {message ? (
        <p role="status" className="text-sm">
          {message}
        </p>
      ) : null}
    </section>
  );
}
