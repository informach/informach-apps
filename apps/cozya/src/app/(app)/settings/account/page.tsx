import { INFORMACH_CONTACT } from "@informach/config/contact";
import { MessageCircle } from "lucide-react";
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
      <h1 className="text-[30px] font-extrabold tracking-display md:text-4xl">
        Minha conta e cozinha
      </h1>
      <AccountSettings
        email={user.email}
        initialSize={access.profile?.householdSize ?? 2}
        initialPreferences={access.profile?.preferences ?? ""}
        hasOtherSubscriptions={hasOtherSubscriptions}
      />
      <section aria-labelledby="contato" className="space-y-2 rounded-2xl bg-muted p-5">
        <h2 id="contato" className="text-xl font-extrabold">
          Fale com a gente
        </h2>
        <p className="text-sm text-muted-foreground">
          Dúvida, ideia ou algo que não funcionou: mande uma mensagem no direct do Instagram.
        </p>
        <a
          href={INFORMACH_CONTACT.directMessageUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center gap-2 font-bold underline underline-offset-4"
        >
          <MessageCircle className="size-4" aria-hidden />@{INFORMACH_CONTACT.instagramHandle}
        </a>
      </section>
    </main>
  );
}
