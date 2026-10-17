import "server-only";

import { cache } from "react";
import { getAddEntitlement } from "@/features/notices/trial";
import { listStudentProfilesForUser } from "@/features/students/service";

/**
 * O que a casca do app precisa para a folha "O que chegou?": a franquia de
 * quem assina e as crianças, na ordem de criação. Memorizado por requisição,
 * porque a folha abre de dois lugares (o + do rodapé no celular e o
 * "Adicionar" da barra de cima no computador) e a consulta é uma só.
 */
export const getShellData = cache(async (userId: string) => {
  const [entitlement, profiles] = await Promise.all([
    getAddEntitlement(userId),
    listStudentProfilesForUser(userId),
  ]);
  return {
    entitlement,
    profiles: profiles.map((profile) => ({ id: profile.id, name: profile.name })),
  };
});
