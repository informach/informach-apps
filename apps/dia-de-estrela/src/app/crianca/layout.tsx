import { TempoReal } from "@/components/tempo-real";
import { requireDevicePage } from "@/features/aparelho/server";
import { SinalDeVida } from "@/features/crianca/components/sinal";
import { getFamily } from "@/features/familia/repository";

export const metadata = { title: "Meu dia" };

/** Área da criança: só o aparelho conectado entra, sem conta de adulto. */
export default async function LayoutDaCrianca({ children }: { children: React.ReactNode }) {
  const device = await requireDevicePage();
  const family = await getFamily(device.ownerId);
  return (
    <div data-area="crianca" data-calmo={family?.calm ? "true" : "false"}>
      {children}
      <SinalDeVida />
      <TempoReal intervaloMs={60_000} />
    </div>
  );
}
