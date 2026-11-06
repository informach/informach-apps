import { redirect } from "next/navigation";

/** "Meus treinos" mora em Treinos, junto dos prontos. */
export default function MeusTreinos() {
  redirect("/treinos#meus");
}
