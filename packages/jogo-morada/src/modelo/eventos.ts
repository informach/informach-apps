import {
  type EstadoDoMundo,
  type EventoDeApresentacao,
  type MoradorId,
  obter,
} from "@informach/morada-sim";
import { rotuloDaFase, textoDaRecusa, verboDoCasal } from "./textos";

/**
 * Os avisos de uma vez só que o servidor manda junto de um passo, em frases.
 * Não são estado: o jogo mostra e esquece.
 */

function nome(estado: EstadoDoMundo, id: MoradorId): string {
  return obter(estado.moradores, id)?.nome ?? "Alguém";
}

/** `null` quando o aviso não interessa a esta pessoa. */
export function textoDoEvento(
  estado: EstadoDoMundo,
  evento: EventoDeApresentacao,
  meuMoradorId: MoradorId | null,
): { tom: "noticia" | "recusa"; texto: string } | null {
  switch (evento.t) {
    case "nasceu":
      return {
        tom: "noticia",
        texto: `${nome(estado, evento.bebeId)} nasceu. ${nome(estado, evento.gestanteId)} está com o bebê no colo.`,
      };
    case "casal":
      return {
        tom: "noticia",
        texto: `${nome(estado, evento.a)} e ${nome(estado, evento.b)} ${verboDoCasal(evento.casal)}.`,
      };
    case "mudou_se":
      return { tom: "noticia", texto: `${nome(estado, evento.moradorId)} veio morar na casa.` };
    case "cresceu": {
      const morador = obter(estado.moradores, evento.moradorId);
      const fase = morador
        ? rotuloDaFase({ fase: evento.fase, aparencia: morador.aparencia })
        : evento.fase;
      return {
        tom: "noticia",
        texto: `${nome(estado, evento.moradorId)} cresceu: agora é ${fase}.`,
      };
    }
    case "resposta":
      return {
        tom: "noticia",
        texto: evento.aceito
          ? `${nome(estado, evento.para)} disse sim a ${nome(estado, evento.de)}.`
          : `${nome(estado, evento.para)} disse não a ${nome(estado, evento.de)}.`,
      };
    case "visita":
      return {
        tom: "noticia",
        texto: evento.chegou
          ? `${nome(estado, evento.moradorId)} chegou para uma visita.`
          : `${nome(estado, evento.moradorId)} foi embora.`,
      };
    case "acidente":
      return {
        tom: "noticia",
        texto: `${nome(estado, evento.moradorId)} não chegou ao banheiro a tempo.`,
      };
    case "recusou":
      // Só interessa a quem dirige o morador: é a ordem dele que não deu certo.
      if (evento.moradorId !== meuMoradorId) return null;
      return {
        tom: "recusa",
        texto: `${nome(estado, evento.moradorId)} desistiu: ${textoDaRecusa(evento.motivo, evento.detalhe).toLowerCase()}`,
      };
  }
}
