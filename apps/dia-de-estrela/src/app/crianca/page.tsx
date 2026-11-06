import { redirect } from "next/navigation";
import { requireDevicePage } from "@/features/aparelho/server";
import { QuemEstaUsando } from "@/features/crianca/components/quem";
import { balances } from "@/features/estrelas/repository";
import { familyView } from "@/features/familia/view";

/** "Quem está usando?": o mesmo tablet para mais de uma criança. */
export default async function Crianca({
  searchParams,
}: {
  searchParams: Promise<{ trocar?: string }>;
}) {
  const device = await requireDevicePage();
  const { trocar } = await searchParams;
  const view = await familyView(device.ownerId);
  const criancas = view.children.filter((c) => device.childIds.includes(c.id));
  if (!trocar && device.childId && criancas.some((c) => c.id === device.childId && c.allowed))
    redirect("/crianca/hoje");
  const saldos = await balances(criancas.map((c) => c.id));
  return (
    <QuemEstaUsando
      criancas={criancas.map((c) => ({
        id: c.id,
        name: c.name,
        color: c.color,
        allowed: c.allowed,
        estrelas: saldos.get(c.id)?.saldo ?? 0,
      }))}
    />
  );
}
