self.addEventListener("push", (event) => {
  let message = {};
  try {
    message = event.data?.json() ?? {};
  } catch {
    /* A visible generic notification still reaches the user. */
  }
  const url =
    typeof message.url === "string" && /^\/(dashboard|recados)(\/|$)/.test(message.url)
      ? message.url
      : "/dashboard";
  event.waitUntil(
    self.registration.showNotification(
      typeof message.title === "string" ? message.title : "Agenda da Turma",
      {
        body: "Abra a Agenda da Turma para conferir as providências.",
        icon: "/web-app-manifest-192x192.png",
        tag: typeof message.tag === "string" ? message.tag : "agenda-routine",
        data: { url },
      },
    ),
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url ?? "/dashboard", self.location.origin);
  event.waitUntil(
    self.clients.openWindow(target.origin === self.location.origin ? target.href : "/dashboard"),
  );
});
