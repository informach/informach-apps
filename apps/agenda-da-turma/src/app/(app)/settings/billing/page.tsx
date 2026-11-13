import { redirect } from "next/navigation";
import { familyAccountUrl } from "@/features/family/account-link";
import { agendaAuthority } from "@/features/family/context";
import { redirectIfUnauthenticated } from "@/lib/auth";

export const metadata = { title: "Assinatura e créditos" };

/** Old bookmarks and billing e-mails converge on the selected canonical family. */
export default async function BillingSettingsPage() {
  const user = await redirectIfUnauthenticated("/settings/billing");
  const actor = await agendaAuthority(user.id);
  redirect(familyAccountUrl(actor.familyGroupId));
}
