# Load tests

These use [k6](https://k6.io). Nothing to install: k6 runs in Docker and talks to Nginx inside
Feasto's Docker network. Start the backend first (`docker compose up -d`).

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
do (Home, a store, My orders) with a 2–5 second pause between taps. It only reads: it logs in as
`resident@feasto.com` and orders nothing.

```powershell
docker run --rm --network feasto_default -v "${PWD}\loadtest:/scripts" -e VUS=50 -e DURATION=60s `
  grafana/k6:1.3.0 run /scripts/classroom.js
```

Measured on the same laptop (Docker: 4 CPUs / 3 GB, and k6 itself runs inside that too, so phones
would see better), 2 copies of the web app, 60 seconds each:

| Users at once | Typical page | Home page, slowest 5% | Requests per second | Errors |
|---|---|---|---|---|
| 50 | 34 ms | 3.1 s | 23 | 0% |
| 100 | 41 ms | 5.7 s | 42 | 0% |
| 200 | 79 ms | 8.8 s | 61 | 0% |

The slowest pages are the first Home page loads when everyone opens the app in the same second.
The web app renders pages and is the busiest part (Admin → System shows the API side); with one
copy instead of two, 200 users were twice as slow.

## Running browse.js on its own

```powershell
docker run --rm --network feasto_default -v "${PWD}\loadtest:/scripts" -e VUS=50 -e DURATION=30s `
  grafana/k6:1.3.0 run /scripts/browse.js
```
