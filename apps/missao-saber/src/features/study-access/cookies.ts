import "server-only";

/** Selection and access share the original device expiry; switching never renews it. */
export function studyCookieOptions(device: { remember: boolean; expiresAt: Date }) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    ...(device.remember ? { expires: device.expiresAt } : {}),
  };
}
