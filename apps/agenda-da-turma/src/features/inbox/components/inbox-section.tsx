import { Button } from "@informach/ui/components/button";
import { Mail, Paperclip } from "lucide-react";
import Link from "next/link";
import { listNewInboxMessages } from "../repository";
import { DiscardInboxMessageButton } from "./discard-inbox-message-button";

/**
 * "Chegou por e-mail": o que foi encaminhado e ainda não virou recado.
 *
 * Fica ao lado do card de rascunhos por uma razão: os dois são coisas que a
 * família começou e não terminou, e a primeira tela do dia é onde elas têm de
 * aparecer. A diferença é que aqui **nada foi lido nem cobrado** — encaminhar
 * é grátis; organizar é que consome a leitura.
 */
export async function InboxSection({ userId }: { userId: string }) {
  const messages = await listNewInboxMessages(userId);
  if (!messages.length) return null;

  return (
    <section
      aria-labelledby="inbox-title"
      className="rounded-3xl border border-chart-2/30 bg-chart-2/5 p-5 sm:p-6"
    >
      <div className="flex items-start gap-3">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-chart-2/15 text-chart-2-ink">
          <Mail className="size-6" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 id="inbox-title" className="text-lg font-semibold">
            Chegou por e-mail
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {messages.length === 1
              ? "Uma mensagem encaminhada esperando você organizar."
              : `${messages.length} mensagens encaminhadas esperando você organizar.`}{" "}
            Nada foi lido ainda.
          </p>
        </div>
      </div>
      <ul className="mt-5 flex flex-col gap-2">
        {messages.map((message) => (
          <li key={message.id} className="flex items-center gap-2">
            <Button
              asChild
              variant="outline"
              className="min-h-11 min-w-0 flex-1 justify-start rounded-xl border-chart-2/30 bg-background text-left text-foreground hover:bg-chart-2/10 hover:text-foreground"
            >
              <Link href={`/recados/novo?email=${message.id}`}>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-medium">
                    {message.subject || "Mensagem sem assunto"}
                  </span>
                  <span className="truncate text-xs font-normal text-muted-foreground">
                    {[
                      message.fromDomain,
                      message.receivedAt.toLocaleDateString("pt-BR", {
                        timeZone: "America/Sao_Paulo",
                      }),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                    {message.attachmentName ? " · com anexo" : ""}
                  </span>
                </span>
                {message.attachmentName ? (
                  <Paperclip className="ml-auto size-4 shrink-0" aria-hidden />
                ) : null}
              </Link>
            </Button>
            <DiscardInboxMessageButton
              id={message.id}
              label={message.subject || "mensagem sem assunto"}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
