/**
 * Logging in and out are full page loads (so nothing from the old session stays alive), which
 * the browser animates as a cross-document view transition (@view-transition in globals.css).
 * This runs in <head> on every page and names the moment, so globals.css can play the right one:
 * - "enter-app": arriving from the login or sign-up page. A circle opens from the button that was
 *   pressed (Log in / Create account) and slowly grows until the whole app shows.
 * - "leave-app": arriving at the login page from inside the app (logging out). The app closes in a
 *   circle towards the Log out button that was pressed, showing the login card underneath.
 * While either plays, nothing on the page keeps its own view-transition name (the header, tab bar,
 * toasts), so the whole screen moves as one inside the circle.
 * Browsers without cross-document view transitions skip it and simply show the page.
 */

/** Where the circle starts or ends, as a share of the screen (survives the page load) */
const CIRCLE_KEY = "feasto:circle";

/** Remembers the middle of the pressed button, for the circle of the next login or logout. */
export function rememberCircleAt(element: Element | null | undefined) {
  if (!element) return;
  const box = element.getBoundingClientRect();
  try {
    sessionStorage.setItem(
      CIRCLE_KEY,
      JSON.stringify({ x: (box.left + box.width / 2) / window.innerWidth, y: (box.top + box.height / 2) / window.innerHeight }),
    );
  } catch {
    // Storage blocked: the circle uses the middle of the screen
  }
}

function entrance() {
  const isAuth = (path: string) => path === "/login" || path === "/register" || path.startsWith("/login/") || path.startsWith("/register/");
  const root = document.documentElement;

  // The old page, just before it's captured: flatten it when leaving through the login boundary
  addEventListener("pageswap", (e) => {
    try {
      const event = e as Event & { viewTransition?: unknown; activation?: { entry?: { url?: string } } };
      const to = event.activation?.entry?.url;
      if (!event.viewTransition || !to) return;
      if (isAuth(location.pathname) !== isAuth(new URL(to).pathname)) root.setAttribute("data-vt-whole", "");
    } catch {}
  });
  // Back to this page from the browser's back/forward cache: undo that
  addEventListener("pageshow", (e) => {
    if ((e as PageTransitionEvent).persisted) root.removeAttribute("data-vt-whole");
  });

  // The new page, before its first paint
  addEventListener("pagereveal", (e) => {
    try {
      const transition = (e as Event & { viewTransition?: ViewTransition & { types: Set<string> } }).viewTransition;
      if (!transition) return;
      const nav = (window as unknown as { navigation?: { activation?: { from?: { url?: string } } } }).navigation;
      const fromUrl = nav?.activation?.from?.url || document.referrer;
      if (!fromUrl) return;
      const from = isAuth(new URL(fromUrl).pathname);
      const here = isAuth(location.pathname);
      const type = from && !here ? "enter-app" : !from && here ? "leave-app" : "";
      if (!type) return;
      transition.types.add(type);
      root.setAttribute("data-vt-whole", "");

      const w = innerWidth;
      const h = innerHeight;
      let x = w / 2;
      let y = h / 2;
      try {
        const saved = JSON.parse(sessionStorage.getItem("feasto:circle") || "null");
        sessionStorage.removeItem("feasto:circle");
        if (saved && typeof saved.x === "number" && typeof saved.y === "number") {
          x = Math.min(Math.max(saved.x, 0), 1) * w;
          y = Math.min(Math.max(saved.y, 0), 1) * h;
        }
      } catch {}
      // Big enough to reach the farthest corner
      const r = Math.ceil(Math.hypot(Math.max(x, w - x), Math.max(y, h - y))) + 2;
      root.style.setProperty("--vt-x", `${Math.round(x)}px`);
      root.style.setProperty("--vt-y", `${Math.round(y)}px`);
      root.style.setProperty("--vt-r", `${r}px`);
      transition.finished.finally(() => {
        root.removeAttribute("data-vt-whole");
        ["--vt-x", "--vt-y", "--vt-r"].forEach((name) => root.style.removeProperty(name));
      });
    } catch {}
  });
}

/** The script for <head>: entrance() as plain JavaScript, run at once. */
export const ENTRANCE_SCRIPT = `(${entrance.toString()})();`;
