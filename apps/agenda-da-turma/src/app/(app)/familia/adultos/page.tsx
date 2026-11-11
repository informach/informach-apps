import { redirect } from "next/navigation";
import { familyAccountUrl } from "@/features/family/account-link";
import { agendaAuthority } from "@/features/family/context";
import { requireUserServer } from "@/lib/auth";
export const metadata = { title: "Adultos da família" };
export default async function FamilyAdultsPage() {
  const actor = await agendaAuthority((await requireUserServer()).id);
  redirect(familyAccountUrl(actor.familyGroupId));
}
