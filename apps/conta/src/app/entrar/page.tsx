import { INFORMACH_CONTACT } from "@informach/config/contact";
import { AuthForm } from "@/features/auth/form";
import { accountReturnDestination } from "@/features/auth/return";
import { getEnv } from "@/lib/env";
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const destination = accountReturnDestination((await searchParams).next);
  return (
    <main id="conteudo" className="auth-page">
      <AuthForm destination={destination} environment={getEnv().environment} />
      <a className="support" href={INFORMACH_CONTACT.directMessageUrl}>
        Precisa de ajuda?
      </a>
    </main>
  );
}
