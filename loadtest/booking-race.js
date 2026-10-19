// Concurrency test: 100 residents try to book the same table at the same moment.
// Expected: exactly 1 booking succeeds, the other 99 are told the time is taken.
// Needs ADMIN_EMAIL and ADMIN_PASSWORD (to approve the test store), see loadtest/README.md.
import exec from "k6/execution";
import http from "k6/http";
import { Counter } from "k6/metrics";

const BASE = __ENV.BASE || "http://nginx/api";
const PEOPLE = Number(__ENV.PEOPLE || 100);
const json = { headers: { "Content-Type": "application/json" } };
const booked = new Counter("bookings_succeeded");
const refused = new Counter("bookings_refused");

export const options = {
  setupTimeout: "3m",
  scenarios: { race: { executor: "shared-iterations", vus: PEOPLE, iterations: PEOPLE, maxDuration: "1m" } },
  thresholds: { bookings_succeeded: ["count==1"] },
};

const post = (path, body, cookie) =>
  http.post(`${BASE}${path}`, JSON.stringify(body), { ...json, cookies: cookie ? { feasto_session: cookie } : {} });
const session = (res) => res.cookies.feasto_session[0].value;

export function setup() {
  const run = Date.now();
  // A store with a single 4-seat table
  const vendor = session(
    post("/auth/register", {
      role: "VENDOR",
      name: "Race Test Owner",
      email: `race-owner-${run}@test.com`,
      phone: "09170000001",
      password: "loadtest123",
      storeName: `Race Test Diner ${run % 10000}`,
      storeAddress: "1 Test Street, Quezon City",
      storeType: "RESTAURANT",
    }),
  );
  http.patch(
    `${BASE}/vendor/store`,
    JSON.stringify({
      name: `Race Test Diner ${run % 10000}`,
      address: "1 Test Street, Quezon City",
      storeType: "RESTAURANT",
      acceptsReservations: true,
      opensAt: "10:00",
      closesAt: "22:00",
      isTemporarilyClosed: false,
    }),
    { ...json, cookies: { feasto_session: vendor } },
  );
  post("/vendor/tables", { label: "Table 1", seats: 4 }, vendor);
  const vendorId = http.get(`${BASE}/vendor/store`, { cookies: { feasto_session: vendor } }).json("store.id");
  const admin = session(post("/auth/login", { email: __ENV.ADMIN_EMAIL, password: __ENV.ADMIN_PASSWORD }));
  post(`/admin/stores/${vendorId}/review`, { decision: "APPROVED" }, admin);

  // The residents who will race
  const cookies = [];
  for (let i = 0; i < PEOPLE; i++) {
    cookies.push(
      session(
        post("/auth/register", {
          role: "RESIDENT",
          name: `Racer ${i + 1}`,
          email: `racer-${run}-${i}@test.com`,
          phone: "09170000002",
          password: "loadtest123",
        }),
      ),
    );
  }
  const tomorrow = new Date(Date.now() + 8 * 3600_000 + 86400_000).toISOString().slice(0, 10);
  return { vendorId, cookies, tomorrow };
}

export default function (data) {
  const i = exec.scenario.iterationInTest;
  const res = post("/bookings", { vendorId: data.vendorId, date: data.tomorrow, time: "19:00", partySize: 2 }, data.cookies[i]);
  if (res.status === 201) booked.add(1);
  else refused.add(1);
}
