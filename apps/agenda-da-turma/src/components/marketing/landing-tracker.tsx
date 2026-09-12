"use client";
import { captureMessage } from "@sentry/nextjs";
import { useEffect, useRef } from "react";
import { LANDING_VARIANT, landingEventSchema } from "@/features/metrics/landing-schema";

export function LandingTracker() {
  const sent = useRef(new Set<string>());
  const firstCta = useRef(true);
  useEffect(() => {
    const record = (input: unknown) => {
      const parsed = landingEventSchema.safeParse(input);
      if (!parsed.success) return;
      const key = JSON.stringify(
        parsed.data.event === "landing_cta" ? { ...parsed.data, firstCta: false } : parsed.data,
      );
      if (sent.current.has(key)) return;
      sent.current.add(key);
      void fetch("/api/product-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
        keepalive: true,
      })
        .then((response) => {
          if (!response.ok)
            captureMessage("agenda.landing.event_not_recorded", {
              level: "warning",
              tags: { status: String(response.status) },
            });
        })
        .catch(() => captureMessage("agenda.landing.event_unavailable", "warning"));
    };
    const onVisible = () => {
      if (document.visibilityState === "visible")
        record({ event: "landing_view", variant: LANDING_VARIANT });
    };
    const onClick = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const element = event.target.closest<HTMLElement>("[data-landing-action]");
      if (!element) return;
      const {
        landingAction: action,
        landingPlacement: placement,
        landingPlan: plan,
        landingCycle: cycle,
        landingScenario: scenario,
      } = element.dataset;
      if (action === "cta") {
        if (
          !(element instanceof HTMLAnchorElement) ||
          new URL(element.href).origin !== location.origin ||
          new URL(element.href).pathname !== "/signup"
        )
          return;
        const payload: unknown = {
          event: "landing_cta",
          variant: LANDING_VARIANT,
          placement,
          selection: plan === "pro" ? { plan, cycle } : { plan },
          firstCta: firstCta.current,
        };
        if (!landingEventSchema.safeParse(payload).success) return;
        record(payload);
        firstCta.current = false;
      } else if (action === "scenario" || action === "plan" || action === "complete") {
        if (element instanceof HTMLInputElement && !element.checked) return;
        record({ event: "landing_demo", variant: LANDING_VARIANT, scenario, action });
      }
    };
    onVisible();
    document.addEventListener("visibilitychange", onVisible);
    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      document.removeEventListener("click", onClick);
    };
  }, []);
  return null;
}
