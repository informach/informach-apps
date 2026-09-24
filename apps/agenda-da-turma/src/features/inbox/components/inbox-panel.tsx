"use client";

import { Button } from "@informach/ui/components/button";
import { toast } from "@informach/ui/components/sonner";
import { Copy, Loader2, Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { catchActionResult } from "@/lib/action-result";
import { createInboxAddressAction, revokeInboxAddressAction } from "../actions";

/**
 * O endereço de e-mail da família, em Ajustes.
 *
 * Mostrado inteiro só quando nasce: o token vive em hash, como o do calendário,
 * e não dá para reconstruí-lo depois. Quem perder gira e recebe outro — o
 * anterior para de aceitar mensagem na mesma hora.
 */
export function InboxPanel({ enabled, hasAddress }: { enabled: boolean; hasAddress: boolean }) {
  const router = useRouter();
  const [address, setAddress] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!enabled)
    return (
      <section className="space-y-2 rounded-xl border bg-card p-5">
        <h2 className="flex items-center gap-2 font-semibold">
          <Mail className="size-4 shrink-0" aria-hidden />
          Receber recados por e-mail
        </h2>
        <p className="text-sm text-muted-foreground">
          Em ativação. Quando estiver disponível, você vai poder encaminhar o e-mail da escola para
          um endereço só seu, e ele aparece aqui para organizar.
        </p>
      </section>
    );

  return (
    <section className="space-y-3 rounded-xl border bg-card p-5">
      <h2 className="flex items-center gap-2 font-semibold">
        <Mail className="size-4 shrink-0" aria-hidden />
        Receber recados por e-mail
      </h2>
      <p className="text-sm text-muted-foreground">
        Encaminhe o e-mail da escola para um endereço só da sua família. Ele chega em "Chegou por
        e-mail", na primeira tela, e você escolhe a criança antes de organizar — encaminhar não
        consome crédito.
      </p>
      {address ? (
        <div className="space-y-2 rounded-lg border border-chart-2/40 bg-chart-2/5 p-3">
          <p className="break-all font-mono text-sm">{address}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(address);
                  toast.success("Endereço copiado");
                } catch {
                  toast.error("Não foi possível copiar");
                }
              }}
            >
              <Copy className="mr-2 size-3.5" aria-hidden />
              Copiar
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Guarde agora: por segurança, o endereço não é mostrado de novo. Se precisar, gere outro
            — o anterior para de aceitar mensagens na hora.
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {hasAddress
            ? "Você já tem um endereço ativo. Gerar outro substitui o atual."
            : "Nenhum endereço ativo."}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <Button
          className="min-h-11"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await catchActionResult(() => createInboxAddressAction({}));
              if (!result.ok) {
                toast.error("Não foi possível gerar o endereço agora.");
                return;
              }
              setAddress(result.value.address);
              router.refresh();
            })
          }
        >
          {pending ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden /> : null}
          {hasAddress ? "Gerar outro endereço" : "Gerar endereço"}
        </Button>
        {hasAddress ? (
          <Button
            variant="ghost"
            className="min-h-11 text-destructive hover:text-destructive"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await catchActionResult(() => revokeInboxAddressAction({}));
                if (!result.ok) {
                  toast.error("Não foi possível desativar agora.");
                  return;
                }
                setAddress(null);
                toast.success("Endereço desativado");
                router.refresh();
              })
            }
          >
            Desativar
          </Button>
        ) : null}
      </div>
    </section>
  );
}
