"use client";
import { useEffect, useState } from "react";

export function useCookingTimer(endsAt: Date | null) {
  // SSR and the first browser render must agree; start the live clock after hydration.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (!endsAt) return;
    const tick = () => setNow(Date.now());
    tick();
    const interval = window.setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [endsAt]);
  const seconds =
    endsAt && now !== null ? Math.max(0, Math.ceil((new Date(endsAt).getTime() - now) / 1000)) : 0;
  return {
    expired: endsAt !== null && now !== null && seconds === 0,
    display:
      now === null
        ? "--:--"
        : `${Math.floor(seconds / 60)
            .toString()
            .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`,
  };
}

export function useScreenAwake(enabled: boolean) {
  const [status, setStatus] = useState("");
  useEffect(() => {
    if (!enabled) {
      setStatus("");
      return;
    }
    if (!("wakeLock" in navigator)) {
      setStatus("Este navegador não permite manter a tela ligada.");
      return;
    }
    let disposed = false;
    let lock: WakeLockSentinel | null = null;
    const acquire = async () => {
      if (document.visibilityState !== "visible" || (lock && !lock.released)) return;
      try {
        const next = await navigator.wakeLock.request("screen");
        if (disposed) {
          await next.release();
          return;
        }
        lock = next;
        setStatus("Tela ligada enquanto esta página estiver visível.");
        next.addEventListener("release", () => {
          if (!disposed)
            setStatus(
              "A tela foi liberada pelo dispositivo. Mantenha a página visível para retomar.",
            );
        });
      } catch {
        if (!disposed)
          setStatus(
            "O dispositivo não permitiu manter a tela ligada. Confira a economia de bateria.",
          );
      }
    };
    void acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", acquire);
      if (lock && !lock.released)
        void lock.release().catch(() => {
          /* Browser releases the lock when the document becomes inactive. */
        });
    };
  }, [enabled]);
  return status;
}
