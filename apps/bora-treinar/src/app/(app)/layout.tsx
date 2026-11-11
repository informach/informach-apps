import { webSsoEnvironment } from "@informach/auth/web-sso-contract";
import { getAppUrl } from "@informach/config/domains";
import { PlanosProvider } from "@/features/billing/planos";
import { familyView } from "@/features/familia/view";
import { FilaOffline } from "@/features/sessoes/fila-offline";
import { requirePageUser } from "@/lib/auth";
import { env } from "@/lib/env";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser();
  const { group } = await familyView(user.id);
  return (
    // A folha de planos mora aqui: qualquer cadeado das telas logadas a abre com o motivo.
    <PlanosProvider
      estado={{
        accountUrl: `${getAppUrl("conta", webSsoEnvironment("bora-treinar", env.NEXT_PUBLIC_APP_URL))}/?familia=${group.id}#compasso`,
      }}
    >
      <FilaOffline
        key={`${user.id}:${group.id}`}
        scope={{ actorId: user.id, familyGroupId: group.id }}
      />
      {children}
    </PlanosProvider>
  );
}
