"use client";
import { useEffect } from "react";
import { endPendingLabSession } from "@/features/labs/runtime/pending-work";
import { CONTEXT_CHANNEL } from "./context-change";

/** Clear private renders in other tabs when the account context changes. */
export function ContextBoundary() {
  useEffect(() => {
    const change = (data: unknown) => {
      if (!data || typeof data !== "object" || !("destination" in data)) return;
      if (
        data.destination !== "/hoje" &&
        data.destination !== "/familia" &&
        data.destination !== "/"
      )
        return;
      endPendingLabSession();
      window.location.replace(data.destination);
    };
    let channel: BroadcastChannel | undefined;
    try {
      channel = new BroadcastChannel(CONTEXT_CHANNEL);
      channel.onmessage = (event) => change(event.data);
    } catch {
      /* Storage events remain available independently. */
    }
    const storage = (event: StorageEvent) => {
      if (event.key !== CONTEXT_CHANNEL || !event.newValue) return;
      try {
        change(JSON.parse(event.newValue));
      } catch {
        /* Invalid local notification carries no trusted state. */
      }
    };
    const restored = (event: PageTransitionEvent) => {
      if (event.persisted) window.location.reload();
    };
    window.addEventListener("storage", storage);
    window.addEventListener("pageshow", restored);
    return () => {
      channel?.close();
      window.removeEventListener("storage", storage);
      window.removeEventListener("pageshow", restored);
    };
  }, []);
  return null;
}
