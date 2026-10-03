import { CabecalhoPagina } from "@/components/ui/pagina";
import { AccountPanel } from "@/features/family/components/account-panel";
import { WeeklyReportEmail } from "@/features/family/components/family-controls";
import { familyDashboard } from "@/features/family/view";
import { weeklyReportUnsubscribed } from "@/features/learning/repository";
import { DeviceManager } from "@/features/study-access/device-manager";
import { listStudyDevices } from "@/features/study-access/repository";
import { requirePageUser } from "@/lib/auth";
import { env } from "@/lib/env";

export const metadata = { title: "Conta da família" };
export default async function Account({
  searchParams,
}: {
  searchParams: Promise<{ pagamento?: string }>;
}) {
  const user = await requirePageUser();
  const [data, devices, unsubscribed, params] = await Promise.all([
    familyDashboard(),
    listStudyDevices(user.id),
    weeklyReportUnsubscribed(user.id),
    searchParams,
  ]);
  return (
    <div className="mx-auto max-w-4xl">
      <CabecalhoPagina
        titulo="Conta e escolhas da família."
        apoio="Gerencie aparelhos, comunicações, assinatura e dados da conta. As mudanças sensíveis pedem uma confirmação recente do responsável."
      />
      <DeviceManager
        connectionUrl={`${env.NEXT_PUBLIC_APP_URL}/estudar/conectar`}
        profiles={data.profiles.map(({ id, nickname }) => ({ id, nickname }))}
        devices={devices.map((device) => ({
          id: device.id,
          label: device.label,
          profileIds: device.profileIds,
          expiresAt: device.expiresAt.toISOString(),
          connectedAt: device.connectedAt?.toISOString() ?? null,
          revokedAt: device.revokedAt?.toISOString() ?? null,
        }))}
      />
      {data.family && (
        <section className="mb-10">
          <WeeklyReportEmail
            enabled={data.family.weeklyReportEmail && !unsubscribed}
            canceladoPeloEmail={unsubscribed}
            email={user.email}
          />
        </section>
      )}
      <AccountPanel payment={params.pagamento} />
    </div>
  );
}
