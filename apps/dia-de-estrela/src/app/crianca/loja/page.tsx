import { requireChildPage } from "@/features/aparelho/server";
import { Loja } from "@/features/crianca/components/loja";
import { childPiggy } from "@/features/crianca/dados";

export const metadata = { title: "Loja" };

export default async function LojaDaCrianca() {
  const device = await requireChildPage();
  const dados = await childPiggy(device.actor, device.childId);
  return (
    <main id="conteudo">
      <Loja dados={dados} />
    </main>
  );
}
