import { webSsoEnvironment } from "@informach/auth/web-sso-contract";
import { getAppUrl } from "@informach/config/domains";
import { env } from "@/lib/env";
export const metadata = {
  title: "Convite para a família",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default function InvitationPage() {
  return (
    <main className="mx-auto max-w-xl space-y-6 px-4 py-10">
      <h1 className="text-2xl font-semibold">Os convites agora ficam na Minha conta</h1>
      <p>
        Este link pertence ao formato anterior da Agenda. Peça à pessoa responsável pela família um
        novo convite pela Minha conta. Os acessos já aceitos são preservados na migração.
      </p>
      <a
        className="font-semibold underline"
        href={getAppUrl("conta", webSsoEnvironment("agenda-da-turma", env.NEXT_PUBLIC_APP_URL))}
      >
        Abrir Minha conta
      </a>
    </main>
  );
}
