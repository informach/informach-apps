import { redirect } from "next/navigation";
import { SignupForm } from "@/features/onboarding/components/signup-form";
import { getCurrentUserServer } from "@/lib/auth";

export const metadata = {
  title: "Criar conta — Agenda da Turma",
};

export default async function SignupPage() {
  const user = await getCurrentUserServer();
  if (user) redirect("/dashboard");

  return <SignupForm />;
}
