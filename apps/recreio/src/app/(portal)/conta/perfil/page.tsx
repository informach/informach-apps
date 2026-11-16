import { APELIDO } from "@informach/recreio";
import Link from "next/link";
import { avatarConhecido } from "@/features/perfis/avatares";
import { EditarPerfil } from "@/features/perfis/components/editar-perfil";
import { paginaDoPortal } from "@/features/sessao/ator";

export const metadata = { title: "Editar perfil" };

export default async function EdicaoDoPerfil() {
  const { ator } = await paginaDoPortal();
  return (
    <div className="max-w-2xl">
      <h1 className="font-display text-4xl font-extrabold tracking-tight">Editar perfil</h1>
      <div className="painel mt-8 p-5 sm:p-6">
        <EditarPerfil
          inicial={{ apelido: ator.perfil.apelido, avatar: avatarConhecido(ator.perfil.avatar) }}
          limites={APELIDO}
        />
        <Link
          href="/conta"
          className="mt-4 inline-block font-bold text-ceu underline underline-offset-4"
        >
          Voltar sem salvar
        </Link>
      </div>
    </div>
  );
}
