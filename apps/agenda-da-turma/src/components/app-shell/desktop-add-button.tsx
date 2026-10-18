"use client";

import { useSearchParams } from "next/navigation";
import type { ComponentProps } from "react";
import { AddSheet } from "@/features/activities/components/add-sheet";

/**
 * O "Adicionar" do computador. Como o do rodapé no celular, leva a criança da
 * tela (`?perfil=`) para a folha "O que chegou?".
 */
export function DesktopAddButton(props: Omit<ComponentProps<typeof AddSheet>, "profileId">) {
  const profileId = useSearchParams().get("perfil");
  return <AddSheet {...props} profileId={profileId} />;
}
