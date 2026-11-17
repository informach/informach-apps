import "server-only";

import { cache } from "react";
import { agendaAuthority } from "@/features/family/context";
import { getAddEntitlement } from "@/features/notices/entitlement-repository";
import { listStudentProfilesForUser } from "@/features/students/service";

/**
 * O que a casca do app precisa para a folha "O que chegou?": a franquia de
 * quem assina e as crianças, na ordem de criação. Memorizado por requisição,
 * porque a folha abre de dois lugares (o + do rodapé no celular e o
 * "Adicionar" da barra de cima no computador) e a consulta é uma só.
 */
export const getShellData = cache(async (userId: string) => {
  const actor = await agendaAuthority(userId);
  const [entitlement, profiles] = await Promise.all([
    getAddEntitlement(actor),
    listStudentProfilesForUser(actor),
  ]);
  return {
    entitlement,
    profiles: profiles.map((profile) => ({ id: profile.id, name: profile.name })),
  };
});
