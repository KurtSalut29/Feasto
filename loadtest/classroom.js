// Classmates using the app like real people: full pages through Caddy (the same path phones use)
// in the classroom setup (infra/lan/start.ps1), so the web app is measured too, not only the API,
// with a pause between taps. Read-only: orders nothing.
//
// The virtual classmates are spread over the 24 sample residents (server/src/history.ts), like a
// real class where everyone has their own account; Feasto limits how many requests one account
// may make per minute. Use your own with ACCOUNTS=a@x.com,b@x.com (all with PASSWORD).
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

const SAMPLE_RESIDENTS = [
  "aldrin.manalo", "angelica.reyes", "bryan.dela.rosa", "camille.gonzales", "christian.villanueva", "divine.ocampo",
  "hazel.ann.torres", "jasmine.bautista", "jericho.salazar", "jerome.navarro", "joanna.rivera", "john.paul.garcia",
  "joshua.fernandez", "kevin.ramos", "kimberly.santos", "kristine.joy.lim", "lovely.grace.tan", "mae.ann.castillo",
  "mark.anthony.cruz", "princess.mendoza", "rhea.mae.aquino", "rodel.pascual", "ronald.morales", "shiela.marie.flores",
].map((name) => `${name}@sample.feasto.com`);

export function setup() {
  const accounts = __ENV.ACCOUNTS ? __ENV.ACCOUNTS.split(",") : SAMPLE_RESIDENTS;
  const cookies = accounts
    .map((email) => http.post(`${BASE}/api/auth/login`, JSON.stringify({ email: email.trim(), password: __ENV.PASSWORD || "demo1234" }), { headers: { "Content-Type": "application/json" } }))
    .filter((res) => res.status === 200)
    .map((res) => res.cookies.feasto_session[0].value);
  if (!cookies.length) throw new Error("None of the accounts could log in (run the sample history first: docker compose --profile tools run --rm --build history)");
  const stores = http.get(`${BASE}/api/stores`, { cookies: { feasto_session: cookies[0] } }).json("stores");
  return { cookies, stores: stores.map((s) => ({ id: s.id, image: s.imageUrl })) };
}

export default function (data) {
  // Each virtual classmate keeps one account; several share one when there are more of them
  const params = { cookies: { feasto_session: data.cookies[(__VU - 1) % data.cookies.length] }, tags: { page: "" } };
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
