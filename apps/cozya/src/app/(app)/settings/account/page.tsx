import { AccountSettings } from "@/features/account/components/account-settings";
import { hasOtherAppSubscriptions } from "@/features/account/repository";
import { getKitchenAccess } from "@/features/kitchen/access";
import { requireUserServer } from "@/lib/auth";

export const metadata = { title: "Minha conta | Cozya" };
export default async function AccountPage() {
  const user = await requireUserServer();
  const [access, hasOtherSubscriptions] = await Promise.all([
    getKitchenAccess(user.id),
    hasOtherAppSubscriptions(user.id),
  ]);
  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8 md:px-8">
      <h1 className="text-3xl font-semibold tracking-tight">Minha conta e cozinha</h1>
      <AccountSettings
        email={user.email}
        initialSize={access.profile?.householdSize ?? 2}
        initialPreferences={access.profile?.preferences ?? ""}
        hasOtherSubscriptions={hasOtherSubscriptions}
      />
    </main>
  );
}
