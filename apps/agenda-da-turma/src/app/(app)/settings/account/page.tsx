import { AccountPanel } from "@/features/account/components/account-panel";
import { agendaAuthority } from "@/features/family/context";
import { requireUserServer } from "@/lib/auth";
export const metadata = { title: "Minha conta" };
export default async function AccountPage() {
  const user = await requireUserServer();
  const actor = await agendaAuthority(user.id);
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8 pb-28">
      <h1 className="text-2xl font-semibold">Minha conta</h1>
      <AccountPanel familyGroupId={actor.familyGroupId} />
    </main>
  );
}
