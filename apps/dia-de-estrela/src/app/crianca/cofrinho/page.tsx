import { requireChildPage } from "@/features/aparelho/server";
import { Cofrinho } from "@/features/crianca/components/cofrinho";
import { childPiggy } from "@/features/crianca/dados";

export default async function CofrinhoDaCrianca() {
  const device = await requireChildPage();
  const dados = await childPiggy(device.ownerId, device.childId);
  return (
    <main id="conteudo">
      <Cofrinho dados={dados} varias={device.childIds.length > 1} />
    </main>
  );
}
