import { webSsoEnvironment } from "@informach/auth/web-sso-contract";
import { getAppUrl } from "@informach/config/domains";
import { Button } from "@informach/ui/components/button";
import { env } from "@/lib/env";
export function AccountPanel({ familyGroupId }: { familyGroupId: string }) {
  return (
    <div className="space-y-6">
      <section className="space-y-3 rounded-xl border p-5">
        <h2 className="text-lg font-semibold">Uma cópia dos seus dados</h2>
        <p className="text-sm text-muted-foreground">
          Baixe os dados da família selecionada que você tem permissão para consultar. Anexos
          completos ficam disponíveis nos recados por 30 dias.
        </p>
        <Button variant="outline" asChild>
          <a href={`/api/data/export?familia=${encodeURIComponent(familyGroupId)}`}>
            Baixar dados em JSON
          </a>
        </Button>
      </section>
      <section className="space-y-3 rounded-xl border p-5">
        <h2 className="text-lg font-semibold">Sua conta compartilhada</h2>
        <p className="text-sm text-muted-foreground">
          Nome, e-mail, senha, segurança e exclusão da conta compartilhada são gerenciados na
          central da conta.
        </p>
        <Button variant="outline" asChild>
          <a
            href={getAppUrl("conta", webSsoEnvironment("agenda-da-turma", env.NEXT_PUBLIC_APP_URL))}
          >
            Gerenciar minha conta compartilhada
          </a>
        </Button>
      </section>
    </div>
  );
}
