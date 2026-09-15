import { cn } from "@informach/ui/lib/utils";
import { type Humor, Mascote } from "../mascote";
import { type Tom, tomClaro } from "./chapa";

/**
 * Fala da Faísca: mascote + balão.
 *
 * O mascote existia em cinco humores e nunca dizia nada durante a missão. Este
 * componente é o canal único dessa voz — abertura de missão, devolutiva de
 * questão e reencontro depois de uma ausência — para que todas soem como a
 * mesma personagem e não como três avisos diferentes.
 *
 * O mascote aparece em qualquer largura: esconder o rosto no celular tirava a
 * voz exatamente de onde a criança estuda.
 *
 * `tituloComo` existe porque a fala tem dois papéis diferentes: quando abre uma
 * seção da página ela é um cabeçalho navegável por leitor de tela; quando é uma
 * devolutiva dentro de `role="status"`, é só texto anunciado. Trocar um pelo
 * outro tira ou inventa um nível na estrutura do documento.
 */
export function FalaFaisca({
  humor = "encorajando",
  tom = "creme",
  titulo,
  tituloComo: Titulo = "p",
  className,
  children,
}: {
  humor?: Humor;
  tom?: Tom;
  titulo?: React.ReactNode;
  tituloComo?: "p" | "h2" | "h3";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex items-start gap-2.5 sm:gap-4", className)}>
      <Mascote
        humor={humor}
        tamanho="pp"
        flutua={false}
        className="mt-1 size-12 sm:size-20 sm:self-center"
      />
      <div className={cn("relative min-w-0 flex-1 rounded-card border-2 p-4", tomClaro[tom])}>
        {/* Bico do balão: um quadrado girado herda o mesmo par fundo/borda do
            tom, então nunca descola da cor do balão. */}
        <span
          aria-hidden="true"
          className={cn(
            "absolute top-6 -left-[9px] size-3.5 rotate-45 border-b-2 border-l-2",
            tomClaro[tom],
          )}
        />
        {titulo && (
          <Titulo className="flex items-center gap-2 font-display text-lg leading-snug font-semibold text-tinta">
            {titulo}
          </Titulo>
        )}
        <div className={cn("text-[0.975rem] leading-relaxed text-tinta", titulo && "mt-2")}>
          {children}
        </div>
      </div>
    </div>
  );
}
