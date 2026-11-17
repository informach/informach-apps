"use client";
import { criarPerfilAction } from "../actions";
import { FormularioDoPerfil } from "./formulario-do-perfil";

export function CriarPerfil({ limites }: { limites: { min: number; max: number } }) {
  return (
    <FormularioDoPerfil
      inicial={{ apelido: "", avatar: "padrao" }}
      limites={limites}
      textoDoBotao="Criar perfil"
      textoPendente="Criando…"
      aoEnviar={criarPerfilAction}
    />
  );
}
