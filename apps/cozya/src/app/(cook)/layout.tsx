import type { ReactNode } from "react";
import { redirectIfUnauthenticated } from "@/lib/auth";

/** Cooking mode takes the whole screen: no header, no tabs, hands on the pan. */
export default async function CookLayout({ children }: { children: ReactNode }) {
  await redirectIfUnauthenticated();
  return <div className="flex min-h-dvh flex-col">{children}</div>;
}
