import type { ReactNode } from "react";
import { Shell } from "@/components/shell";
import { requireStaff } from "@/lib/access";

export const dynamic = "force-dynamic";

/** Tudo daqui para dentro exige papel owner ou admin com duas etapas ativas. */
export default async function PainelLayout({ children }: { children: ReactNode }) {
  const staff = await requireStaff();
  return <Shell staff={staff}>{children}</Shell>;
}
