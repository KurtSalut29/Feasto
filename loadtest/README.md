# Load tests

These use [k6](https://k6.io). Nothing to install: k6 runs in Docker and talks to Nginx inside
Feasto's Docker network. Start the backend first (`docker compose up -d`).

## Rate limits and these tests

Feasto limits how fast one account and one network can go (`server/src/lib/rateLimit.ts`):

| What | Limit |
|---|---|
| Any request of one signed-in account | 1200 a minute (`API_REQUESTS_PER_MINUTE` in `.env`, 0 = off) |
| Orders (checkout) | 10 per account in 5 minutes |
| Photo and document uploads | 30 per account in 10 minutes |
| New accounts | 300 in 10 minutes across Feasto, and the admin's "sign-ups per network" (20 by default) where Feasto can see networks |
| Wrong passwords | 5 per e-mail in 15 minutes |

- **Part 3 (classroom)** spreads its virtual classmates over the 24 sample residents, so it runs with
  every limit on, like a real class.
- **`browse.js` and part 1** hammer the API from one account without pauses to find the most it can
  take, so the account limit would stop them. Turn it off for the test: add `API_REQUESTS_PER_MINUTE=0`
  to `.env`, run `docker compose up -d api-1 api-2 api-3`, test, then remove the line and run it again.
- **Part 2 (booking race)** signs up 101 accounts, so it can run twice in 10 minutes before the
  overall sign-up cap stops it.

## 1. One API copy vs three (scalability)

From the `Feasto` folder, in PowerShell:

```powershell
.\loadtest\compare.ps1                      # 50 users for 30 seconds
.\loadtest\compare.ps1 -Vus 100 -Duration 60s
```

It stops `api-2` and `api-3`, runs `browse.js` against `api-1` alone, starts them again, runs it
against all three, and prints both results side by side. Raw numbers are saved in
`loadtest/results/` for your report.

Result measured on the development laptop (Ryzen 3 7320U, Docker limited to 4 CPUs / 3 GB),
50 simultaneous users browsing for 30 seconds:

| Setup | Requests per second | Average response | 95% of responses under | Errors |
|---|---|---|---|---|
| 1 API copy | 406 | 114 ms | 244 ms | 0% |
| 3 API copies | 840 | 56 ms | 142 ms | 0% |

Three copies handled about **2× the traffic at half the response time**. It isn't a full 3×
because all copies share the same 4 CPU cores and the same database on one laptop; on
separate machines the gain would be closer to 3×.

## 2. 100 people booking the same table at once (concurrency)

```powershell
$pw = (Select-String -Path .env -Pattern '^ADMIN_PASSWORD=').Line.Split('=',2)[1]
docker run --rm --network feasto_default -v "${PWD}\loadtest:/scripts" `
  -e ADMIN_EMAIL=admin@feasto.com -e ADMIN_PASSWORD=$pw `
  grafana/k6:1.3.0 run /scripts/booking-race.js
```

It creates a store with **one** table and 100 residents, then all 100 book the same table and
time in the same instant. Expected output: `bookings_succeeded: 1` and `bookings_refused: 99`.
(k6 also reports the 99 refusals as "failed requests"; that's the correct answer here.)

The database's unique index on (table, time) is what guarantees this, no matter which of the
three API copies each request lands on.

## 3. A class using the app at once (the classroom setup)

With the classroom setup running (`.\infra\lan\start.ps1`), this opens full pages the way phones
do (Home, a store, My orders) with a 2–5 second pause between taps. It only reads and orders
nothing. It logs in as the 24 sample residents (each with about 55 past orders, so My orders is
big); `-e ACCOUNTS=resident@feasto.com` uses one new account instead, like a classmate on day one
(then turn the account limit off as described above, since all users share that one account).

```powershell
docker run --rm --network feasto_default -v "${PWD}\loadtest:/scripts" -e VUS=50 -e DURATION=60s `
  grafana/k6:1.3.0 run /scripts/classroom.js
```

Measured with one new account (`resident@feasto.com`) on the same laptop (Docker: 4 CPUs / 3 GB,
and k6 itself runs inside that too, so phones would see better), 2 copies of the web app, 60 seconds each:

| Users at once | Typical page | Home page, slowest 5% | Requests per second | Errors |
|---|---|---|---|---|
| 50 | 34 ms | 3.1 s | 23 | 0% |
| 100 | 41 ms | 5.7 s | 42 | 0% |
| 200 | 79 ms | 8.8 s | 61 | 0% |

With the 24 sample residents and their long order histories, 100 users is past what 2 web copies
can render (Home took 26 s typical on 2026-11-12, 0 errors): their pages are about twice as big.

The slowest pages are the first Home page loads when everyone opens the app in the same second.
The web app renders pages and is the busiest part (Admin → System shows the API side); with one
copy instead of two, 200 users were twice as slow.

## 4. More and more people at once (how Feasto behaves under load)

```powershell
docker run --rm --network feasto_default -v "${PWD}\loadtest:/scripts" grafana/k6:1.3.0 run /scripts/ramp.js
```

The classroom visitors of part 3 in steps of 10, 25, 50 and 100 people (40 seconds each, `STEP=60s`
for longer), then back down to 10. Each step is measured on its own, so you see how response times
grow with the number of users, whether anything fails, and whether Feasto recovers.

Measured on 2026-11-12 (the 24 sample residents; Docker: 6 CPUs / 3.8 GB, k6 on the same laptop):

| People at once | Typical request | Slowest 5% | Home page, typical | Failed |
|---|---|---|---|---|
| 10 | 39 ms | 294 ms | 151 ms | 0% |
| 25 | 54 ms | 561 ms | 152 ms | 0% |
| 50 | 66 ms | 1.31 s | 195 ms | 0% |
| 100 | 87 ms | 2.95 s | 1.33 s | 0% |
| back to 10 | 35 ms | 175 ms | 103 ms | 0% |

Nothing fails at any step; pages get slower past about 50 people because building pages (the web
app) uses all the CPU there is, and speed comes straight back once the crowd leaves. What changed
on the way to these numbers (before: Home 2.14 s typical at 100 people, 293 ms at 50):

- The bar at the bottom of every resident page loaded the resident's whole order history to find the
  orders in progress; it asks `/orders/summary` for just those now.
- The Orders page shows the latest 15 past orders first (it was 50: about 500 KB per visit).
- RabbitMQ's health check started an Erlang VM every 10 seconds, taking a whole CPU core; it's a
  plain port check now.
- The classroom setup runs 3 copies of the web app instead of 2 (`WEB_COPIES` in `.env`).

## 5. Race conditions: many people doing the same thing at the same instant

```powershell
python loadtestaces.py
```

Twelve tests, each releasing all of its requests in the same instant (a thread barrier) and then
checking the database. It makes its own store, 30 residents and 8 riders (`@race.test`) and deletes
them at the end. Results go to `loadtest/results/races.json`.

| Test | What happens at once | Correct result |
|---|---|---|
| The last plate | 30 residents order a dish with 1 left | 1 order, stock 0 |
| Ten plates | 30 residents order from a stock of 10 | exactly 10 sold, stock never below 0 |
| Double tap | the same checkout sent 8 times (same key) | 1 checkout |
| Accept vs cancel | on 15 orders, the store accepts while the resident cancels | one of them wins on each; stock back only for the cancelled |
| Eight riders, one job | 8 riders accept the same delivery | 1 rider gets it |
| One rider, five jobs | a rider accepts 5 jobs at once | 1 job taken |
| Rate the store twice | one order rated from 10 tabs | 1 review, stars counted once |
| Tip twice | the rider rated and tipped from 10 tabs | 1 rating, tip paid once |
| One table | 30 residents book the only table at the same time | 1 booking |
| Scheduled orders | 10 come due while 6 worker processes look for them | each sent to the store once |
| Pay vs cancel | 10 residents cancel while GCash is still confirming | nobody charged for a cancelled order |
| Chat burst | 20 messages sent at once | all 20 saved |

12 of 12 passed on 2026-11-12, and again while part 3 ran 100 people at the same time (0% failed
requests out of 4,825). What makes them safe: conditional updates that only succeed while the row is
still in the expected state (stock, order status, job not taken), unique indexes (one checkout per
key, one review and one rider rating per order, one booking per table and time), and short Redis
locks (a rider's accept).

## Running browse.js on its own

```powershell
docker run --rm --network feasto_default -v "${PWD}\loadtest:/scripts" -e VUS=50 -e DURATION=30s `
  grafana/k6:1.3.0 run /scripts/browse.js
```
