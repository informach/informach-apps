import { LinkChapa } from "@/components/ui/botao-chapa";
import { Chapa } from "@/components/ui/chapa";
import { reviewDateLabel } from "../engine";

export function CourseCompletion({ nextReviewOn }: { nextReviewOn: string | null }) {
  return (
    <Chapa tom="verde" className="mb-6" role="status">
      <h2 className="font-display text-2xl font-semibold text-tinta">
        Você percorreu toda a trilha!
      </h2>
      <p className="mt-2 text-tinta">
        Todas as missões do percurso principal têm suas respostas registradas. Isso mostra o caminho
        percorrido; a autonomia continua sendo observada em estratégias diferentes, em mais de um
        dia.
      </p>
      <p className="mt-2 text-sm text-tinta-suave">
        {nextReviewOn
          ? `Seu próximo reencontro está marcado para ${reviewDateLabel(nextReviewOn)}.`
          : "Você pode aprofundar uma ideia ou escolher uma missão para praticar novamente."}
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <LinkChapa href="/revisao">Ver revisões e recuperação</LinkChapa>
        <LinkChapa href="/laboratorio" tom="contorno">
          Explorar desafios
        </LinkChapa>
      </div>
    </Chapa>
  );
}
