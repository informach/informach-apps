"use client";
import { createContext, type ReactNode, useContext } from "react";
import type { AgendaAuthority } from "@/features/family/authority";

/** Both the adult and selected family come from the authenticated server shell. */
const QueueOwnerContext = createContext<AgendaAuthority | null>(null);
export function QueueOwnerProvider({
  actor,
  children,
}: {
  actor: AgendaAuthority;
  children: ReactNode;
}) {
  return <QueueOwnerContext.Provider value={actor}>{children}</QueueOwnerContext.Provider>;
}
export function useQueueOwner() {
  return useContext(QueueOwnerContext);
}
