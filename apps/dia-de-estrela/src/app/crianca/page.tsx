import { redirect } from "next/navigation";
import { requireDevicePage } from "@/features/aparelho/server";
import { QuemEstaUsando } from "@/features/crianca/components/quem";
import { childChooser } from "@/features/crianca/dados";

/** "Quem está usando?": o mesmo tablet para mais de uma criança. */
export default async function Crianca({
  searchParams,
}: {
  searchParams: Promise<{ trocar?: string }>;
}) {
  const device = await requireDevicePage();
  const { trocar } = await searchParams;
  const criancas = await childChooser(device);
  if (!trocar && device.childId && criancas.some((c) => c.id === device.childId && c.allowed))
    redirect("/crianca/hoje");
  return <QuemEstaUsando criancas={criancas} />;
}
