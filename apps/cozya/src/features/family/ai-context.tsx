"use client";
import { createContext, type ReactNode, useContext } from "react";

const Context = createContext<string | null>(null);
export function CozyaAiContext({
  familyGroupId,
  children,
}: {
  familyGroupId: string | null;
  children: ReactNode;
}) {
  return <Context.Provider value={familyGroupId}>{children}</Context.Provider>;
}
export const useCozyaAiFamily = () => useContext(Context);
