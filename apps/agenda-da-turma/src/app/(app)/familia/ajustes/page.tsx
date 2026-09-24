import Link from "next/link";
import { CalendarFeedPanel } from "@/features/calendar-feed/components/feed-panel";
import { hasCalendarFeed } from "@/features/calendar-feed/service";
import { FamilyHeader } from "@/features/family/components/family-tabs";
import { getFamilyEntitlements } from "@/features/family/entitlements";
import { InboxPanel } from "@/features/inbox/components/inbox-panel";
import { hasInboxAddress, inboxEnabled } from "@/features/inbox/service";
import { NotificationPreferencesPanel } from "@/features/notifications/components/preferences-panel";
import { getNotificationPreferences } from "@/features/notifications/service";
import { requireUserServer } from "@/lib/auth";
import { env } from "@/lib/env";

export const metadata = { title: "Ajustes da família" };

export default async function FamilySettingsPage() {
  const user = await requireUserServer();
  const [preferences, entitlement, feedActive, inboxActive] = await Promise.all([
    getNotificationPreferences(user.id),
    getFamilyEntitlements(user.id),
    hasCalendarFeed(user.id),
    hasInboxAddress(user.id),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 pb-28 sm:px-8">
      <FamilyHeader
        current="/familia/ajustes"
        subtitle="Como você quer ser avisada da rotina, e onde os compromissos aparecem."
      />
      <NotificationPreferencesPanel
        initial={preferences}
        enabled={entitlement.enabled}
        publicKey={env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY ? env.VAPID_PUBLIC_KEY : null}
      />
      <CalendarFeedPanel active={feedActive} enabled={entitlement.enabled} />
      <InboxPanel enabled={inboxEnabled()} hasAddress={inboxActive} />
      <Link href="/settings/account" className="block text-sm text-primary-ink underline">
        Dados e exclusão da conta
      </Link>
    </main>
  );
}
