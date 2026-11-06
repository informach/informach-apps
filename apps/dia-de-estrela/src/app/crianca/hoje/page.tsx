import { requireChildPage } from "@/features/aparelho/server";
import { Hoje } from "@/features/crianca/components/hoje";
import { childDay } from "@/features/crianca/dados";

export default async function HojeDaCrianca() {
  const device = await requireChildPage();
  const dados = await childDay(device.ownerId, device.childId);
  return (
    <main id="conteudo">
      <Hoje dados={dados} varias={device.childIds.length > 1} />
    </main>
  );
}
