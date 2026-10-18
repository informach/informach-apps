import { FamilyIcon, HomeIcon, ListIcon, WeekIcon } from "./nav-icons";

/**
 * Os quatro destinos do app, os mesmos no rodapé do celular e na barra de cima
 * do computador. A aba Semana mora em `/calendario`: o endereço continua o
 * mesmo para os e-mails, as notificações e os links guardados.
 */
export const APP_DESTINATIONS = [
  { href: "/dashboard", label: "Hoje", icon: HomeIcon },
  { href: "/atividades", label: "Atividades", icon: ListIcon },
  { href: "/calendario", label: "Semana", icon: WeekIcon },
  { href: "/familia", label: "Família", icon: FamilyIcon },
] as const;

/** O detalhe de uma atividade (`/atividades/<id>`), e não a lista nem as suas subpáginas fixas. */
const ACTIVITY_DETAIL = /^\/atividades\/[0-9a-f-]{36}(\/|$)/i;

/**
 * Qual aba fica acesa. Os recados moram sob `/recados/`, mas são atividades.
 * O detalhe de uma atividade volta para Hoje ("← Hoje"), e é Hoje que fica
 * aceso nele, como na prancha.
 */
export function isActiveDestination(path: string, href: string) {
  const activePath = ACTIVITY_DETAIL.test(path)
    ? "/dashboard"
    : path.startsWith("/recados")
      ? "/atividades"
      : path;
  return activePath === href || activePath.startsWith(`${href}/`);
}

/** A criança escolhida viaja com a navegação, menos para Família. */
export function withProfileParam(href: string, profileId: string | null) {
  return profileId && href !== "/familia"
    ? `${href}?perfil=${encodeURIComponent(profileId)}`
    : href;
}
