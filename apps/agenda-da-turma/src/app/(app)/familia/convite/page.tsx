import { AcceptInvitation } from "@/features/family/components/accept-invitation";
import { requireUserServer } from "@/lib/auth";
export const metadata = {
  title: "Convite para a família — Agenda da Turma",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default async function InvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const user = await requireUserServer();
  const { token } = await searchParams;
  return (
    <main className="mx-auto max-w-xl space-y-6 px-4 py-10">
      <h1 className="text-2xl font-semibold">Cuidar da rotina juntos</h1>
      {token && /^[a-f0-9]{64}$/.test(token) ? (
        <AcceptInvitation token={token} email={user.email} />
      ) : (
        <p>Este convite não é válido.</p>
      )}
    </main>
  );
}
