import type { SVGAttributes } from "react";

/** The lunchbox seal: a container with its lid, drawn like the lucide set. */
export function LunchboxIcon(props: SVGAttributes<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <rect x="3" y="8" width="18" height="12" rx="2" />
      <path d="M3 12h18M7 8V6a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2" />
    </svg>
  );
}
