import { FilaOffline } from "@/features/sessoes/fila-offline";
import { requirePageUser } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requirePageUser();
  return (
    <>
      <FilaOffline />
      {children}
    </>
  );
}
