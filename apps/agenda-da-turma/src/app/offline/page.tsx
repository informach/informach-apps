import { Button } from "@informach/ui/components/button";
import Link from "next/link";
import { OfflineIllustration } from "@/components/illustrations";

export const metadata = { title: "Sem conexão" };

/**
 * A tela que o service worker serve quando a navegação não sai.
 *
 * Pública e estática de propósito: ela precisa existir no cache antes de
 * qualquer login, e não pode depender de sessão nem de banco — se dependesse,
 * seria mais uma navegação a falhar justamente quando a rede caiu.
 *
 * Diz o que é verdade e nada além: o que já estava aberto continua legível, e
 * concluir e reabrir esperam a rede na fila do aparelho (§9 do guia do app).
 * Editar, cancelar e mandar recado novo continuam exigindo conexão.
 */
export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 px-5 py-16 text-center">
      <OfflineIllustration className="max-w-[200px]" />
      <div className="space-y-2">
        <h1 className="text-2xl font-extrabold tracking-tight">Sem conexão agora</h1>
        <p className="text-pretty text-muted-foreground">
          Não deu para abrir esta página. O que já estava aberto continua na tela, e marcar como
          feito funciona: a Agenda guarda e manda sozinha quando a rede voltar.
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button asChild>
          <Link href="/dashboard">Tentar de novo</Link>
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Dica: no portão da escola o sinal costuma voltar uns passos adiante.
      </p>
    </main>
  );
}
