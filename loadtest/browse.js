// Load test: many residents browsing stores at once.
// Run through Docker (see loadtest/README.md); it talks to Nginx inside the Docker network.
import { check } from "k6";
import http from "k6/http";

const BASE = __ENV.BASE || "http://nginx/api";

export const options = {
  vus: Number(__ENV.VUS || 50), // simultaneous virtual users
  duration: __ENV.DURATION || "30s",
  thresholds: {
    http_req_failed: ["rate<0.01"], // under 1% errors
    http_req_duration: ["p(95)<1000"], // 95% of requests under 1 second
  },
};

/** Runs once: create a resident to browse with, and find some stores. */
export function setup() {
  const email = `loadtest-${Date.now()}@test.com`;
  const res = http.post(
    `${BASE}/auth/register`,
    JSON.stringify({ role: "RESIDENT", name: "Load Tester", email, phone: "09170000000", password: "loadtest123" }),
    { headers: { "Content-Type": "application/json" } },
  );
  const cookie = res.cookies.feasto_session[0].value;
  const stores = http.get(`${BASE}/stores`, { cookies: { feasto_session: cookie } }).json("stores");
  return { cookie, storeIds: stores.map((s) => s.id).slice(0, 10) };
}

/** Each virtual user repeats this: open the store list, then one store's menu. */
export default function (data) {
  const params = { cookies: { feasto_session: data.cookie } };
  check(http.get(`${BASE}/stores`, params), { "store list is 200": (r) => r.status === 200 });
  if (data.storeIds.length > 0) {
    const id = data.storeIds[Math.floor(Math.random() * data.storeIds.length)];
    check(http.get(`${BASE}/stores/${id}`, params), { "store page is 200": (r) => r.status === 200 });
  }
}
