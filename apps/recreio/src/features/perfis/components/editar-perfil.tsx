"use client";
import { editarPerfilAction } from "../actions";
import type { NovoPerfil } from "../regras";
import { FormularioDoPerfil } from "./formulario-do-perfil";

export function EditarPerfil({
  inicial,
  limites,
}: {
  inicial: NovoPerfil;
  limites: { min: number; max: number };
}) {
  return (
    <FormularioDoPerfil
      inicial={inicial}
      limites={limites}
      textoDoBotao="Salvar perfil"
      textoPendente="Salvando…"
      aoEnviar={(novo) => editarPerfilAction({ anterior: inicial, novo })}
    />
  );
}
