import type { Metadata } from "next";
import { PageHeader } from "@/components/blocks";
import { AiSection } from "@/features/operations/components/ai-section";
import { EmailsSection } from "@/features/operations/components/emails-section";
import { RoutinesSection } from "@/features/operations/components/routines-section";
import { SentrySection } from "@/features/operations/components/sentry-section";
import { ServicesSection } from "@/features/operations/components/services-section";
import { getOperationsView } from "@/features/operations/service";
import { requireStaff } from "@/lib/access";

export const metadata: Metadata = { title: "Operação" };
export const dynamic = "force-dynamic";

export default async function OperacaoPage() {
  // A página confere por conta própria: o layout não roda de novo nas navegações dentro do app.
  await requireStaff();
  const now = new Date();
  const view = await getOperationsView(now);
  return (
    <>
      <PageHeader
        title="Operação"
        description="Serviços, rotinas, e-mails e IA. Os serviços são conferidos a cada minuto nesta tela e a cada 5 minutos pela vigia, que avisa por e-mail quando algo cai."
      />
      <ServicesSection view={view} now={now} />
      <RoutinesSection routines={view.routines} now={now} />
      <div className="grid items-start gap-5 xl:grid-cols-2">
        <EmailsSection emails={view.emails} />
        <div className="grid gap-5">
          <AiSection rows={view.ai} />
          <SentrySection sentry={view.sentry} />
        </div>
      </div>
    </>
  );
}
