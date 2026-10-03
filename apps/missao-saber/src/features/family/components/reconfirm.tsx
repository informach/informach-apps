import { LinkChapa } from "@/components/ui/botao-chapa";
export function ConfirmarAcesso({
  para,
  next = "/familia/conta",
}: {
  para: string;
  next?: string;
}) {
  return (
    <div className="rounded-card border border-sombra bg-creme p-4">
      <p className="font-semibold text-tinta">Confirme o acesso do responsável.</p>
      <p className="mt-2 text-sm text-tinta-suave">
        Para {para}, entre novamente. Você voltará a esta parte do aplicativo; a confirmação vale
        por dez minutos.
      </p>
      <div className="mt-4">
        <LinkChapa href={`/entrar?next=${encodeURIComponent(next)}`} medida="p">
          Confirmar acesso do responsável
        </LinkChapa>
      </div>
    </div>
  );
}
