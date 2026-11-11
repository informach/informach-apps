"use client";
import { getAppUrl } from "@informach/config/domains";
import { Button } from "@informach/ui/components/button";
import { Input } from "@informach/ui/components/input";
import { Label } from "@informach/ui/components/label";
import { toast } from "@informach/ui/components/sonner";
import { Textarea } from "@informach/ui/components/textarea";
import Link from "next/link";
import { useState, useTransition } from "react";
import { catchActionResult, isActionRejected } from "@/features/recipes/components/action-errors";
import { ssoEnvironment } from "@/lib/auth-client";
import { clearDataAction, saveProfileAction } from "../actions";

export function AccountSettings({
  email,
  initialSize,
  initialPreferences,
}: {
  email: string;
  initialSize: number;
  initialPreferences: string;
}) {
  const [householdSize, setSize] = useState(initialSize);
  const [preferences, setPreferences] = useState(initialPreferences);
  const [confirmation, setConfirmation] = useState("");
  const [pending, startTransition] = useTransition();
  return (
    <div className="space-y-8">
      <form
        className="space-y-4 rounded-2xl border p-5"
        onSubmit={(event) => {
          event.preventDefault();
          startTransition(async () => {
            const result = await catchActionResult(() =>
              saveProfileAction({ householdSize, preferences }),
            );
            if (!result.ok) toast.error("Não foi possível salvar seu perfil.");
            else toast.success("Preferências salvas");
          });
        }}
      >
        <h2 className="text-xl font-semibold">Sua cozinha</h2>
        <p className="text-sm text-muted-foreground">{email}</p>
        <div className="space-y-2">
          <Label htmlFor="household-size">Quantas pessoas costumam comer em casa?</Label>
          <Input
            id="household-size"
            type="number"
            min={1}
            max={20}
            required
            className="max-w-28"
            value={householdSize}
            onChange={(e) => setSize(e.target.valueAsNumber)}
          />
          <p className="text-xs text-muted-foreground">
            É o número que aparece em "Na mesa" quando você planeja uma refeição.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="culinary-preferences">Lembretes da sua rotina (opcional)</Label>
          <Textarea
            id="culinary-preferences"
            maxLength={1000}
            rows={4}
            value={preferences}
            onChange={(e) => setPreferences(e.target.value)}
            placeholder="Ex.: preparar jantar e 2 marmitas; tenho forno e panela de pressão"
          />
          <p className="text-xs text-muted-foreground">
            Você controla este texto. Ele fica aqui como lembrete e não é enviado automaticamente à
            IA. Não inferimos alergias, religião ou preferências a partir das receitas.
          </p>
        </div>
        <Button type="submit" disabled={pending}>
          Salvar preferências
        </Button>
      </form>
      <section className="space-y-3 rounded-2xl border p-5">
        <h2 className="text-xl font-semibold">Seus dados com você</h2>
        <p className="text-sm text-muted-foreground">
          Baixe receitas, planos, compras, progresso e preferências em JSON. A exportação inclui
          prévias de IA ainda disponíveis para recuperação.
        </p>
        <Button asChild variant="outline" className="min-h-11">
          <a href="/api/account/export">Baixar meus dados</a>
        </Button>
        <p className="text-xs text-muted-foreground">
          Prévias de IA: até 24 horas. Eventos de uso e diagnóstico: até 90 dias.{" "}
          <Link href="/privacidade" className="underline">
            Ver política de privacidade
          </Link>
          .
        </p>
      </section>
      <section className="space-y-4 rounded-2xl border p-5">
        <h2 className="text-xl font-semibold">Apagar dados do Cozya</h2>
        <p className="text-sm text-muted-foreground">
          Remove suas receitas, planos, compras, progresso, prévias e preferências. Sua conta
          Informach e assinatura continuam ativas. O teste gratuito não recomeça. Para encerrar
          cobranças, use{" "}
          <Link href="/settings/billing" className="underline">
            Gerenciar assinatura
          </Link>
          .
        </p>
        <div className="space-y-2">
          <Label htmlFor="clear-confirmation">Digite APAGAR para confirmar</Label>
          <Input
            id="clear-confirmation"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            autoComplete="off"
          />
        </div>
        <Button
          variant="destructive"
          disabled={pending || confirmation !== "APAGAR"}
          onClick={() =>
            startTransition(async () => {
              const result = await catchActionResult(() =>
                clearDataAction({ confirmation: "APAGAR" }),
              );
              if (!result.ok) {
                if (!isActionRejected(result.error) && result.error.code === "REAUTHENTICATE")
                  toast.error("Entre novamente para confirmar sua identidade", {
                    action: {
                      label: "Entrar",
                      onClick: () => {
                        window.location.href = "/login?reautenticar=1&next=%2Fsettings%2Faccount";
                      },
                    },
                  });
                else if (
                  !isActionRejected(result.error) &&
                  result.error.code === "AI_CLEANUP_PENDING"
                )
                  toast.error(
                    "Uma operação de IA está em andamento ou aguardando devolução de crédito. Tente apagar novamente após a conclusão.",
                  );
                else toast.error("Não foi possível apagar os dados. Tente novamente.");
              } else {
                setConfirmation("");
                setPreferences("");
                setSize(2);
                toast.success("Dados do Cozya apagados");
              }
            })
          }
        >
          Apagar meus dados do Cozya
        </Button>
      </section>
      <section className="space-y-3 rounded-2xl border p-5">
        <h2 className="text-xl font-semibold">Sua conta compartilhada</h2>
        <p className="text-sm text-muted-foreground">
          Nome, e-mail, senha, segurança e exclusão da conta compartilhada são gerenciados na
          central da conta.
        </p>
        <Button variant="outline" asChild>
          <a href={getAppUrl("conta", ssoEnvironment)}>Gerenciar minha conta compartilhada</a>
        </Button>
      </section>
    </div>
  );
}
