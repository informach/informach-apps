/** Only provider-owned HTTPS destinations may leave the authenticated portal. */
export function stripeDestination(value: string): `https://${string}` {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Invalid billing destination");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    !["checkout.stripe.com", "billing.stripe.com"].includes(url.hostname)
  )
    throw new Error("Invalid billing destination");
  return `https://${url.hostname}${url.pathname}${url.search}${url.hash}`;
}
