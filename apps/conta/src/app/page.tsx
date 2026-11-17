import { listWebSessions } from "@informach/auth/web-sessions";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { AccountDashboard } from "@/features/account/dashboard";
import { LimitedAccountDashboard } from "@/features/account/limited-dashboard";
import { accountOverview } from "@/features/account/service";
import { accountPath, accountQuerySchema } from "@/features/auth/return";
import { billingPanel } from "@/features/billing/service";
import { accountParticipation } from "@/lib/account-closure";
import { getAuth, requireAccount } from "@/lib/auth";
import { getEnv } from "@/lib/env";
export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{
    familia?: string;
    pagamento?: string;
    contratos?: string;
    extrato?: string;
    plano?: "mensal" | "anual";
    privacidade?: "recente" | "limite" | "erro";
  }>;
}) {
  const query = accountQuerySchema.safeParse(await searchParams);
  if (!query.success) notFound();
  const user = await requireAccount(accountPath(query.data));
  const session = await getAuth().getSession(await headers());
  if (!session) redirect("/entrar");
  const security = await listWebSessions(user.id, session.session.id);
  const participation = await accountParticipation(user.id);
  if (participation.state !== "active") {
    const billing = await billingPanel(user.id, undefined, query.data);
    return (
      <LimitedAccountDashboard
        user={user}
        state={participation.state}
        security={security}
        billing={billing}
      />
    );
  }
  const { familia } = query.data;
  const data = await accountOverview(user.id, familia);
  const billing = await billingPanel(user.id, data.group?.id, query.data);
  return (
    <AccountDashboard
      user={user}
      data={data}
      security={security}
      billing={billing}
      initialCycle={
        query.data.plano === "anual"
          ? "annual"
          : query.data.plano === "mensal"
            ? "monthly"
            : undefined
      }
      environment={getEnv().environment}
      privacyStatus={query.data.privacidade}
    />
  );
}
