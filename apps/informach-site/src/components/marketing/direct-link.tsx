import { SITE } from "@/lib/site";

/** Canal público de contato das páginas legais: o direct do Instagram. */
export function DirectLink() {
  return (
    <a className="underline underline-offset-2" href={SITE.contact.directMessageUrl}>
      @{SITE.contact.instagramHandle}
    </a>
  );
}
