import type { ReactNode } from "react";
import { redirectIfUnauthenticated } from "@/lib/auth";

export default async function AppLayout({ children }: { children: ReactNode }) {
  await redirectIfUnauthenticated();

  return <div>{children}</div>;
}
