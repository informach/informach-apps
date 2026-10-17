import type { Metadata } from "next";
import { MoneyPage } from "@/features/money/components/money-view";
import { OwnerOnly } from "@/features/money/components/owner-only";
import { getMoney } from "@/features/money/service";
import { requireStaff } from "@/lib/access";

export const metadata: Metadata = { title: "Dinheiro" };

/** Receita e cobrança são só para contas owner: para admin, nada é consultado. */
export default async function DinheiroPage() {
  const staff = await requireStaff();
  if (staff.role !== "owner") return <OwnerOnly />;
  return <MoneyPage view={await getMoney()} />;
}
