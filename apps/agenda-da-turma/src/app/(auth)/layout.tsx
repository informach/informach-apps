import type { ReactNode } from "react";

/** Central sign-in entry uses the app surface and stays centered without stretching the card. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-app-ground text-foreground">
      <main className="flex flex-1 items-center justify-center px-4 py-10">{children}</main>
    </div>
  );
}
