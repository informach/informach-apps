"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

/** Public HTML is readable immediately; demo controls wait for their event handlers. */
export function useDemoReady() {
  return useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
}
