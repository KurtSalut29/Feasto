# Feasto

A Parallel and Distributed Multi-Vendor Food Ordering and Booking System.

Residents order from several stores in one checkout, choose delivery or pickup, and book tables.
Vendors run their store from a web dashboard. Riders take delivery jobs and share their live
location. Admins approve stores and riders, watch every order, run sales reports and monitor the servers.

## Project layout

| Folder | What it is |
|---|---|
| `web/` | Next.js app. Residents and riders get a mobile layout; vendors and admins get a dashboard |
| `server/` | Node.js + TypeScript backend: the REST API (`src/api.ts`) and the background worker (`src/worker.ts`) |
| `server/prisma/` | Database schema and migrations (Prisma + PostgreSQL) |
| `infra/nginx/` | Load balancer config that spreads requests across the API copies |
| `loadtest/` | k6 load and concurrency tests (see `loadtest/README.md`) |
| `docker-compose.yml` | Starts the whole backend with one command |

## Architecture

```
                      ┌──► api-1 ┐        ┌─► PostgreSQL  (data, transactions, unique rules)
Browser ─► Next.js ─► Nginx ──► api-2 ├────────┼─► Redis       (cache, cart, locks, live messages, heartbeats)
   ▲        :3000     :8080 └──► api-3 ┘        └─► RabbitMQ ─┬─► worker-1 ┐ orders, payments,
   │                                                         └─► worker-2 ┘ report jobs (in parallel)
   └──── live updates (Server-Sent Events) ◄── any API copy ◄── Redis pub/sub ◄── workers / other copies
```

## Features by user

| Resident (mobile) | Rider (mobile) | Vendor (dashboard) | Admin (dashboard) |
|---|---|---|---|
| Browse, search, filter by store type | Admin approval of vehicle details | Store details, cover photo, hours, "temporarily closed" | Approve / reject / suspend stores and riders |
| One cart across several stores | Online/offline switch | Menu with photos, sections, stock, availability | Users list with search |
| Delivery or pickup, cash or online (simulated) | Live job list, race-safe accept | Live order board with sound, accept/decline, preparing, ready | All orders across stores |
| Live order tracking with rider map | Pickup → delivered, live GPS sharing | Table setup and daily bookings | Sales reports computed in parallel |
| Table booking by date, time and party size | Earnings history | Today's orders and sales | System monitor (API copies, workers, queues) |
| Saved addresses, profile, notifications | Profile, notifications | Notifications | Notifications |

## Requirements

- Node.js 24+
- Docker Desktop (it must show "Engine running")

## First-time setup

Secrets live in `.env` files that are never committed. Create them from the examples:

```bash
cp .env.example .env                  # used by docker compose
cp server/.env.example server/.env    # used when running the server outside Docker
cp web/.env.example web/.env.local    # used by the Next.js app
```

Generate one secret and put the **same value** in `JWT_SECRET` in all three files:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Also set `ADMIN_PASSWORD` in `.env`. The admin account (`ADMIN_EMAIL`) is created automatically
the first time the backend starts. Residents, riders and vendors sign up at `/register`.

## Running

```bash
docker compose up -d --build     # backend: build and start everything
cd web && npm install && npm run dev   # web app: http://localhost:3000
```

Useful commands (from the `Feasto` folder):

```bash
docker compose ps                # what is running
docker compose logs -f worker    # follow one service's logs
docker compose down              # stop everything (data is kept)
```

Every long-running service restarts by itself when Docker Desktop starts.
RabbitMQ's own dashboard: http://localhost:15672 (user `feasto`, password `feasto`).

## Working on the backend without Docker rebuilds

Keep `postgres`, `redis` and `rabbitmq` running in Docker and run the API on your machine with live reload:

```bash
cd server
npm install
npm run dev:api                  # http://localhost:4000/api/health
npm run dev:worker               # in a second terminal
```

After changing `server/prisma/schema.prisma`: `npm run db:migrate -- --name describe_the_change`.

## Parallel and distributed concepts, and how to demo them

| Concept | Where in Feasto | Demo |
|---|---|---|
| **Load balancing / horizontal scaling** | Nginx round-robin over 3 API copies | Refresh http://localhost:8080/api/health and watch `instance` rotate; run `loadtest/compare.ps1` (1 copy: 406 req/s → 3 copies: 840 req/s) |
| **Fault tolerance** | Nginx skips a dead copy; workers share queues; heartbeats | `docker compose stop api-2` (or `worker-2`) while using the app, open Admin → System, then `docker compose start api-2` |
| **Stateless sessions** | Signed login cookie that every copy can check | The `X-Served-By` header changes between requests while you stay logged in |
| **Parallel processing** | Worker handles 5 jobs at once; 2 workers | Order from 3 stores in one checkout: all 3 stores are notified in ~1× the time, not 3× |
| **Map-reduce** | Sales report split into one job per store, combined at the end | Admin → Reports: "Computed in 0.96 s · 19 store jobs on worker-1 + worker-2" |
| **Message queue + outbox** | Checkout writes events in the same DB transaction; workers relay them to RabbitMQ | Admin → System shows queues and "events waiting to be sent" |
| **Saga (distributed transaction)** | Online payment fails → orders cancelled and stock restored automatically | At checkout choose Online payment and turn on "Demo: make the payment fail" |
| **Idempotency** | Each checkout carries a one-time key | Double-clicking "Place order" never creates two orders |
| **Concurrency control** | Conditional updates and unique indexes | 10 buyers for the last item → 1 order; 5 riders accept one job → 1 gets it; 100 bookings for one table → 1 (`loadtest/booking-race.js`) |
| **Distributed lock** | Redis `SET NX` per rider | A rider can't grab two jobs with quick double taps |
| **Shared cache** | Store list and menus cached in Redis, cleared on change | Edit a price as a vendor; every API copy shows the new price immediately |
| **Real-time over pub/sub** | Server-Sent Events + Redis pub/sub across API copies | Keep the resident's order page open while the vendor accepts; it updates without refreshing |
| **Shared state** | Cart and login lockout counter in Redis | 5 wrong passwords across different copies still lock the account |
| **Shared file storage** | Photos on a Docker volume used by all copies, served by Nginx | Upload a dish photo; it loads no matter which copy serves the page |
