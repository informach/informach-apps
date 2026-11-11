import { AppShell } from "@/components/app-shell";
import { selectedFamilyContext } from "@/features/family/context";
import { requirePageUser } from "@/lib/auth";

export default async function ParentLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser();
  const family = await selectedFamilyContext(user.id);
  return <AppShell context={{ audience: "parent", familyName: family?.name }}>{children}</AppShell>;
}
