import { isRecentWebAuthentication } from "@informach/auth/web-sessions";
import { webSsoEnvironment } from "@informach/auth/web-sso-contract";
import { INFORMACH_CONTACT } from "@informach/config/contact";
import { getAppUrl } from "@informach/config/domains";
import Link from "next/link";
import { LinkChapa } from "@/components/ui/botao-chapa";
import { isContentManager } from "@/features/content-maintenance/service";
import { getSession, requirePageUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { familyDashboard } from "../view";
import { PrivacyControls } from "./family-controls";
import { ConfirmarAcesso } from "./reconfirm";

export async function AccountPanel() {
  const user = await requirePageUser("/familia/conta");
  const session = await getSession();
  const acessoRecente =
    !!session &&
    (await isRecentWebAuthentication({
      userId: session.user.id,
      sessionId: session.session.id,
      app: "missao-saber",
      maxAgeSeconds: 600,
    }));
  const data = await familyDashboard();
  return (
    <div>
      <section className="mb-10 rounded-card border border-sombra bg-creme p-6">
        <h2 className="font-display text-2xl font-semibold">Missão Saber no Compasso</h2>
        <p className="mt-3 text-sm">
          {data.access.paid
            ? "As trilhas completas estão disponíveis para esta família."
            : "Você pode explorar as atividades gratuitas com um estudante."}
        </p>
        <p className="mt-2 text-sm text-tinta-suave">
          Assinatura, pessoas, dados da conta e créditos de IA ficam na Minha conta. O Missão Saber
          não consome créditos de IA.
        </p>
        <a
          href={`${getAppUrl("conta", webSsoEnvironment("missao-saber", env.NEXT_PUBLIC_APP_URL))}/?familia=${data.authority.familyGroupId}#compasso`}
          className="mt-5 inline-flex min-h-11 items-center font-semibold underline"
        >
          Abrir Minha conta e Compasso
        </a>
      </section>

      <section className="mb-10">
        <h2 className="mb-3 font-display text-xl font-semibold text-tinta">
          Seus dados e suas escolhas
        </h2>
        {acessoRecente ? (
          <PrivacyControls canManageFamily={data.canManageFamily} />
        ) : (
          <ConfirmarAcesso para="exportar dados ou apagar o estudo desta família" />
        )}
        <p className="mt-4 text-sm text-muted-foreground">
          <a
            href={INFORMACH_CONTACT.directMessageUrl}
            className="font-medium text-foreground underline underline-offset-4"
          >
            Suporte e solicitações pelo direct do Instagram
          </a>{" "}
          ·{" "}
          <Link
            href="/privacidade"
            className="font-medium text-foreground underline underline-offset-4"
          >
            Privacidade
          </Link>
        </p>
      </section>

      {(await isContentManager(user.id)) && (
        <LinkChapa href="/manutencao" tom="contorno">
          Abrir manutenção de conteúdo
        </LinkChapa>
      )}
    </div>
  );
}
