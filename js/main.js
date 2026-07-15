// Bootstrap entry point.
document.addEventListener("DOMContentLoaded", () => {
  window.CatdokuUi.init();
});

// Service worker registration + update handling.
//
// sw.js is cache-first, so the page you're looking at was built from the
// PREVIOUS deploy's cache. Registering alone doesn't fix that: the new worker
// installs, calls skipWaiting(), activates and claims the page — but nothing
// reloads it, so the new HTML/JS/CSS aren't used until the *next* launch.
// That's what made every deploy show up one launch late.
//
// Reloading on controllerchange closes that gap: the moment the new worker
// takes over, we re-fetch the document and get the new cache's assets.
if ("serviceWorker" in navigator) {
  // A controller present at startup means this page is already being served by
  // a worker, so any later handover is an UPDATE. On a first-ever visit there's
  // no controller yet and the initial claim() would otherwise trigger a
  // pointless reload — hence the flag.
  const hadControllerAtStartup = Boolean(navigator.serviceWorker.controller);
  let reloading = false;

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadControllerAtStartup || reloading) return;
    reloading = true;
    window.location.reload();
  });

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").then((reg) => {
      // iOS standalone PWAs are lazy about update checks — they can go a long
      // time without noticing a new sw.js. Asking explicitly on each launch,
      // and again when the app returns to the foreground, keeps that honest.
      reg.update();
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") reg.update();
      });
    });
  });
}
