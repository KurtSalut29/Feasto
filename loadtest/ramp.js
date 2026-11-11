// How Feasto behaves as more people use it at once: the same classmates as classroom.js (Home, a
// store, My orders, with 2 to 5 seconds between taps), in steps of 10, 25, 50 and 100 people, then
// back down to 10 to see it recover. Each step is measured on its own, so the summary shows how
// response times grow with the number of users and whether anything starts failing.
//
//   docker run --rm --network feasto_default -v "${PWD}\loadtest:/scripts" grafana/k6:1.3.0 run /scripts/ramp.js
//
// STEP=40s sets how long each step lasts.
import classmate, { setup as classSetup } from "./classroom.js";

const STEP = __ENV.STEP || "40s";
const seconds = parseInt(STEP, 10);
const STEPS = [
  ["10 users", 10],
  ["25 users", 25],
  ["50 users", 50],
  ["100 users", 100],
  ["back to 10", 10],
];

export const options = {
  setupTimeout: "2m",
  summaryTrendStats: ["med", "p(95)", "max"],
  // One step after the other; each one's requests carry its name as a tag
  scenarios: Object.fromEntries(
    STEPS.map(([name, vus], i) => [
      name.replace(/\W+/g, "_"),
      { executor: "constant-vus", vus, duration: STEP, startTime: `${i * (seconds + 5)}s`, gracefulStop: "5s", tags: { step: name } },
    ]),
  ),
  // Listed so the summary has a line per step: every page, the Home page, and failed requests
  thresholds: Object.fromEntries(
    STEPS.flatMap(([name]) => [
      [`http_req_duration{step:${name}}`, ["max>=0"]],
      [`http_req_duration{step:${name},page:home}`, ["max>=0"]],
      [`http_req_failed{step:${name}}`, ["rate<0.01"]],
    ]),
  ),
};

export const setup = classSetup;
export default classmate;
