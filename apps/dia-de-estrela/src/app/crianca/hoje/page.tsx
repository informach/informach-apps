import { requireChildPage } from "@/features/aparelho/server";
import { Hoje } from "@/features/crianca/components/hoje";
import { childDay } from "@/features/crianca/dados";

export default async function HojeDaCrianca() {
  const device = await requireChildPage();
  const dados = await childDay(device.actor, device.childId);
  return (
    <main id="conteudo">
      {/* A chave é o dia da casa: virou o dia, a tela começa do zero (marcações e lembretes locais). */}
      <Hoje
        key={`${dados.child.id}:${dados.relogio.data}`}
        dados={dados}
        varias={device.childIds.length > 1}
      />
    </main>
  );
}
