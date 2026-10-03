import { AppShell } from "@/components/app-shell";
import { currentDashboard } from "@/lib/view";

// Keep server-action refreshes outside a group-level loading boundary (Next #86055).
export default async function StudyLayout({ children }: { children: React.ReactNode }) {
  const data = await currentDashboard();
  return (
    <AppShell context={{ audience: "study", profiles: data.profiles, selected: data.profile }}>
      {children}
    </AppShell>
  );
}
