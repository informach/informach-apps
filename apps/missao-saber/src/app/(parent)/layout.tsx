import { AppShell } from "@/components/app-shell";
import { requirePageUser } from "@/lib/auth";

export default async function ParentLayout({ children }: { children: React.ReactNode }) {
  await requirePageUser();
  return <AppShell context={{ audience: "parent" }}>{children}</AppShell>;
}
