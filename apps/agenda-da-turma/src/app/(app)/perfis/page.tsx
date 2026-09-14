import { redirect } from "next/navigation";

/**
 * Crianças passaram a morar em Família, que é onde quem procura "meus filhos"
 * olha primeiro. A rota antiga continua respondendo por causa de links salvos
 * e das telas internas de extracurriculares (`/perfis/[id]/extras`).
 *
 * Temporário (307) de propósito: o navegador guarda um 308 para sempre, e um
 * produto ainda em movimento não deve gravar essa decisão na máquina de quem
 * usa.
 */
export default function PerfisPage() {
  redirect("/familia");
}
