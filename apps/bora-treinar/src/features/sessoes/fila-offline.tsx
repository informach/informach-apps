"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { saveSessionAction } from "./actions";
import { enviarPendentes } from "./fila";

/** Ao abrir o app (e quando a rede volta), salva os treinos que ficaram na fila. */
export function FilaOffline() {
  const router = useRouter();
  const [aviso, setAviso] = useState("");
  useEffect(() => {
    let ativo = true;
    const enviar = async () => {
      const enviados = await enviarPendentes((payload) => saveSessionAction(payload));
      if (enviados && ativo) {
        setAviso(
          enviados === 1
            ? "Um treino feito sem internet foi salvo."
            : `${enviados} treinos feitos sem internet foram salvos.`,
        );
        router.refresh();
      }
    };
    void enviar();
    window.addEventListener("online", enviar);
    return () => {
      ativo = false;
      window.removeEventListener("online", enviar);
    };
  }, [router]);
  if (!aviso) return null;
  return (
    <div className="toast good floating" role="status">
      {aviso}
    </div>
  );
}
