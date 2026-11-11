// Classmates using the app like real people: full pages through Caddy (the same path phones use)
// in the classroom setup (infra/lan/start.ps1), so the web app is measured too, not only the API,
// with a pause between taps. Read-only: logs in with one existing resident (EMAIL / PASSWORD), orders nothing.
import { check, sleep } from "k6";
import http from "k6/http";

const BASE = __ENV.BASE || "http://caddy:8081";

export const options = {
  vus: Number(__ENV.VUS || 50),
  duration: __ENV.DURATION || "60s",
  summaryTrendStats: ["avg", "med", "p(95)", "max"],
  // Listed so the summary shows each kind of page on its own line
  thresholds: Object.fromEntries(["home", "store", "orders", "api", "photo"].map((p) => [`http_req_duration{page:${p}}`, ["max>=0"]])),
};

export function setup() {
  const res = http.post(`${BASE}/api/auth/login`, JSON.stringify({ email: __ENV.EMAIL || "resident@feasto.com", password: __ENV.PASSWORD || "demo1234" }), {
    headers: { "Content-Type": "application/json" },
  });
  const cookie = res.cookies.feasto_session[0].value;
  const stores = http.get(`${BASE}/api/stores`, { cookies: { feasto_session: cookie } }).json("stores");
  return { cookie, stores: stores.map((s) => ({ id: s.id, image: s.imageUrl })) };
}

export default function (data) {
  const params = { cookies: { feasto_session: data.cookie }, tags: { page: "" } };
  const get = (path, page) => http.get(`${BASE}${path}`, { ...params, tags: { page } });

  // Opens the app: the Home page
  check(get("/resident", "home"), { "home 200": (r) => r.status === 200 });
  check(get("/api/stores", "api"), { "stores api 200": (r) => r.status === 200 });
  sleep(2 + Math.random() * 3);

  // Taps a store and looks at its menu
  const store = data.stores[Math.floor(Math.random() * data.stores.length)];
  check(get(`/resident/stores/${store.id}`, "store"), { "store page 200": (r) => r.status === 200 });
  check(get(`/api/stores/${store.id}`, "api"), { "menu api 200": (r) => r.status === 200 });
  if (store.image) get(store.image, "photo");
  sleep(2 + Math.random() * 3);

  // Checks their orders
  check(get("/resident/orders", "orders"), { "orders page 200": (r) => r.status === 200 });
  sleep(2 + Math.random() * 3);
}
