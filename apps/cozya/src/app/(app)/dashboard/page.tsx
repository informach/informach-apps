import { redirect } from "next/navigation";

/** The app opens on Hoje now; old links, e-mails and installed apps still land there. */
export default function DashboardPage() {
  redirect("/hoje");
}
