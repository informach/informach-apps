"use client";
import { useCallback, useEffect, useRef, useState } from "react";

/** A draft belongs to one profile and task in this tab; it is never submitted automatically. */
export function useNoteDraft(scope: string, initial = "") {
  const key = `missao-note:${scope}`;
  const [text, setText] = useState(initial);
  const current = useRef(initial);
  const [storageError, setStorageError] = useState(false);
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(key);
      const restored = saved !== null && saved.length <= 1000 ? saved : initial;
      current.current = restored;
      setText(restored);
    } catch {
      setStorageError(true);
    }
  }, [key, initial]);
  const change = useCallback(
    (value: string) => {
      current.current = value;
      setText(value);
      try {
        sessionStorage.setItem(key, value);
      } catch {
        setStorageError(true);
      }
    },
    [key],
  );
  function confirm(sent: string, clear: boolean) {
    // A delayed acknowledgement cannot erase newer writing.
    if (current.current !== sent) return;
    if (clear) {
      current.current = "";
      setText("");
    }
    try {
      sessionStorage.removeItem(key);
    } catch {
      setStorageError(true);
    }
  }
  function discard() {
    current.current = initial;
    setText(initial);
    try {
      sessionStorage.removeItem(key);
    } catch {
      setStorageError(true);
    }
  }
  return { text, change, confirm, discard, storageError };
}
