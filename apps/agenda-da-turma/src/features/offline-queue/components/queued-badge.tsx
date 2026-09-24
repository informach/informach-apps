import { Badge } from "@informach/ui/components/badge";
import { CloudUpload } from "lucide-react";

/**
 * "Sobe quando a rede voltar."
 *
 * O selo é o que separa esta fila de uma promessa vazia. A decisão da pessoa
 * aparece aplicada — ela decidiu —, mas o card diz, no mesmo lugar em que diz o
 * prazo, que aquilo ainda não chegou ao servidor. Sem isto, marcar "feito" sem
 * rede se parece exatamente com marcar "feito" com rede, e alguém guarda o
 * telefone achando que resolveu.
 */
export function QueuedBadge({ className }: { className?: string }) {
  return (
    <Badge variant="outline" className={className}>
      <CloudUpload className="mr-1 size-3" aria-hidden />
      Sobe quando a rede voltar
    </Badge>
  );
}
