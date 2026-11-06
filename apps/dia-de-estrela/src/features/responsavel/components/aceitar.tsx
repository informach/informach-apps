"use client";
import { Erro, useAcao } from "@/components/acao";
import { aceitarConviteAction } from "@/features/familia/actions";

export function AceitarConvite({ token }: { token: string }) {
  const { pendente, erro, rodar } = useAcao();
  return (
    <div className="w-full">
      <button
        type="button"
        className="b3 b3-folha w-full"
        disabled={pendente}
        onClick={() =>
          rodar(
            () => aceitarConviteAction(token),
            (d) => window.location.assign(d.destination),
          )
        }
      >
        Aceitar o convite
      </button>
      <Erro texto={erro} />
    </div>
  );
}
