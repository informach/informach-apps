import Link from "next/link";
import { getIsProForUser } from "@/features/billing/server-cache";
import { CalendarFeedPanel } from "@/features/calendar-feed/components/feed-panel";
import { hasCalendarFeed } from "@/features/calendar-feed/service";
import { FamilyPanel } from "@/features/family/components/family-panel";
import { getFamilyEntitlements } from "@/features/family/entitlements";
import { getFamilyOverview } from "@/features/family/repository";
import { NotificationPreferencesPanel } from "@/features/notifications/components/preferences-panel";
import { getNotificationPreferences } from "@/features/notifications/service";
import { requireUserServer } from "@/lib/auth";
import { env } from "@/lib/env";
export const metadata = { title: "Família — Agenda da Turma" };
export default async function FamilyPage() {
  const user = await requireUserServer();
  const [overview, isPro, preferences, entitlement, feedActive] = await Promise.all([
    getFamilyOverview(user.id),
    getIsProForUser(user.id),
    getNotificationPreferences(user.id),
    getFamilyEntitlements(user.id),
    hasCalendarFeed(user.id),
  ]);
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8 pb-28 sm:px-8">
      <header>
        <h1 className="text-2xl font-semibold">Família e preferências</h1>
        <p className="mt-2 text-muted-foreground">
          Combine responsabilidades e como deseja acompanhar a rotina.
        </p>
      </header>
      <FamilyPanel overview={overview} isPro={isPro} />
      <NotificationPreferencesPanel
        initial={preferences}
        enabled={entitlement.enabled}
        publicKey={env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY ? env.VAPID_PUBLIC_KEY : null}
      />
      <CalendarFeedPanel active={feedActive} enabled={entitlement.enabled} />
      <Link href="/settings/account" className="block text-sm text-primary underline">
        Dados e exclusão da conta
      </Link>
    </main>
  );
}
