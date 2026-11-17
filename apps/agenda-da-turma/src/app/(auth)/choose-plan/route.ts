import { NextResponse } from "next/server";
import { compassoOfferHref, parseCycleQueryParam } from "@/features/billing/plans-content";

/** Saved links keep their billing cycle and continue to the Compasso account central. */
export function GET(request: Request) {
  const cycle = new URL(request.url).searchParams.get("cycle") ?? undefined;
  return NextResponse.redirect(
    new URL(compassoOfferHref(parseCycleQueryParam(cycle)), request.url),
    307,
  );
}
