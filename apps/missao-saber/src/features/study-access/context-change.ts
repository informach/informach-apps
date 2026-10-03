"use client";
import { endPendingLabSession } from "@/features/labs/runtime/pending-work";

export const CONTEXT_CHANNEL = "missao-context-changed";
export type ContextDestination = "/hoje" | "/familia" | "/";

export function announceContextChange(destination: ContextDestination) {
  const message = { destination, id: crypto.randomUUID() };
  endPendingLabSession();
  try {
    const channel = new BroadcastChannel(CONTEXT_CHANNEL);
    channel.postMessage(message);
    channel.close();
  } catch {
    // Storage events are a second channel on browsers without BroadcastChannel.
  }
  try {
    localStorage.setItem(CONTEXT_CHANNEL, JSON.stringify(message));
  } catch {
    // The server still validates profile and session on every request.
  }
}
