"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useQueueOwner } from "./owner";
import { type PendingWrite, visibleForOwner } from "./queue";
import { listPendingWrites, QUEUE_CHANGED_EVENT } from "./store";

export function useOfflineQueue() {
  const owner = useQueueOwner();
  const generation = useRef(0);
  const [entries, setEntries] = useState<PendingWrite[]>([]);
  const reload = useCallback(() => {
    const request = ++generation.current;
    if (!owner) {
      setEntries([]);
      return;
    }
    void listPendingWrites().then((all) => {
      if (generation.current === request) setEntries(visibleForOwner(all, owner));
    });
  }, [owner]);
  useEffect(() => {
    reload();
    window.addEventListener(QUEUE_CHANGED_EVENT, reload);
    window.addEventListener("focus", reload);
    return () => {
      generation.current++;
      window.removeEventListener(QUEUE_CHANGED_EVENT, reload);
      window.removeEventListener("focus", reload);
    };
  }, [reload]);
  // Filtering during render also prevents a previous context flashing before the effect.
  return { entries: owner ? visibleForOwner(entries, owner) : [], reload };
}
