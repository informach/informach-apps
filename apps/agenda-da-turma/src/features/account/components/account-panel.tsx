"use client";
import { Button } from "@informach/ui/components/button";
import { Input } from "@informach/ui/components/input";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
export function AccountPanel({
  email,
  otherSubscriptions,
}: {
  email: string;
  otherSubscriptions: boolean;
}) {
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [understandsScope, setUnderstandsScope] = useState(false);
  return (
    <div className="space-y-6">
      <section className="space-y-3 rounded-xl border p-5">
        <h2 className="text-lg font-semibold">Uma cópia dos seus dados</h2>
        <p className="text-sm text-muted-foreground">
          Baixe os perfis, as atividades e os dados de recados da sua conta. Anexos completos ficam
          disponíveis nos recados por 30 dias.
        </p>
        <Button variant="outline" asChild>
          <a href="/api/data/export">Baixar dados em JSON</a>
        </Button>
      </section>
      <section className="space-y-4 rounded-xl border border-destructive/30 p-5">
        <h2 className="text-lg font-semibold">Excluir minha conta Informach</h2>
        <p className="text-sm text-muted-foreground">
          A conta é compartilhada entre os apps Informach. A exclusão remove o acesso e os dados
          vinculados em todos eles e encerra a assinatura da Agenda da Turma.
        </p>
        <p className="text-sm text-muted-foreground">
          Seus perfis privados, recados, convites e acessos serão removidos. Atividades de turma já
          usadas por outras famílias permanecem sem atribuição à sua conta. Registros de cobrança
          podem ser retidos para as finalidades descritas na política de privacidade.
        </p>
        <p className="text-sm text-muted-foreground">
          A exclusão só prossegue depois do encerramento das cobranças ativas. Se esse encerramento
          falhar, sua conta será preservada para você tentar novamente. Enviaremos a confirmação
          para {email}.
        </p>
        <label htmlFor="delete-confirmation" className="grid gap-2 text-sm font-medium">
          Digite EXCLUIR para solicitar o link
          <Input
            id="delete-confirmation"
            autoComplete="off"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
          />
        </label>
        {otherSubscriptions ? (
          <p role="alert" className="text-sm">
            Há assinaturas em outros apps Informach. Encerre-as nas configurações desses apps antes
            de excluir a conta compartilhada.
          </p>
        ) : null}
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={understandsScope}
            onChange={(event) => setUnderstandsScope(event.target.checked)}
          />
          Entendo que a exclusão afeta todos os apps Informach.
        </label>
        <Button
          variant="destructive"
          disabled={busy || confirmation !== "EXCLUIR" || !understandsScope || otherSubscriptions}
          onClick={async () => {
            setBusy(true);
            setMessage("");
            try {
              const result = await authClient.deleteUser({ callbackURL: "/" });
              setMessage(
                result.error
                  ? "Não foi possível iniciar a exclusão. Entre novamente e tente outra vez. Sua conta continua disponível."
                  : "Enviamos um link de confirmação para seu e-mail. A exclusão só acontece quando você confirmar pelo link.",
              );
            } catch {
              setMessage(
                "Não foi possível iniciar a exclusão. Sua conta continua disponível; tente novamente.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          Enviar confirmação de exclusão
        </Button>
        {message ? (
          <p role="status" className="text-sm">
            {message}
          </p>
        ) : null}
      </section>
    </div>
  );
}
