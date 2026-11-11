# Feasto

A Parallel and Distributed Multi-Vendor Food Ordering and Booking System.

Residents order from several stores in one checkout, choose delivery or pickup, and book tables.
Vendors run their store from a web dashboard, with their own riders if they have them. Riders (on
motorcycles) take delivery jobs and share their live location. The one admin approves stores and free
riders, watches every order, runs sales reports and monitors the servers.

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
   ▲        :3000     :8080 └──► api-3 ┘        └─► RabbitMQ ─┬─► worker-1 ┐ one worker per CPU
   │                                                         ├─►   ...    │ (4 CPUs → 4 workers):
   │                                                         └─► worker-N ┘ orders, payments, reports
   └──── live updates (Server-Sent Events) ◄── any API copy ◄── Redis pub/sub ◄── workers / other copies
```

## Features by user

| Resident (mobile) | Rider (mobile) | Vendor (dashboard) | Admin (dashboard) |
|---|---|---|---|
| Browse, search, filter by store type | Jobs reach the store's riders first, then the nearest free riders in waves; sign-up with license photo; a free rider is approved by the admin, a store's rider by the store (using its code) | Sign-up with business permit and map pin; store details, cover photo, hours, "temporarily closed" | Approve / reject / suspend stores and riders, with their documents side by side. Check renewed permits and licenses, watch what's expired or expiring, step in on stuck orders, read the activity log, and set the delivery fee and rider wave timings |
| One cart across several stores | Online/offline switch | Menu with photos, sections, stock, availability; own riders: code, approve, suspend, remove | Users list with search |
| Delivery or pickup, cash or online (simulated) | Live job list, race-safe accept | Live order board with sound, accept/decline, preparing, ready | All orders across stores |
| Live order tracking with rider map | Pickup → delivered, live GPS sharing | Table setup and daily bookings | Sales reports computed in parallel, for any period |
| Table booking by date, time and party size | Earnings history | Today's orders and sales | System monitor (API copies, workers, queues) |
| Saved addresses, profile, notifications | Profile, notifications | Notifications | Notifications |
| Ratings & reviews, saved stores, order again | 7-day earnings chart | 14-day sales chart, ratings & reviews | 14-day sales chart, top-rated stores |
| | | Reports for any period (date-range picker), best sellers, payments, delivery vs pickup | |
| | | **Feasto report** download: PDF, Word or Excel | **Feasto report** download: PDF, Word or Excel |
| | | | Disable / enable accounts (logged out everywhere instantly) |

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

## Using Feasto on a phone (as an app)

Residents and riders can install Feasto on their phone's home screen. It then opens full screen,
like a normal app, and goes straight to their own area (stores for residents, jobs for riders).

Phones only allow installing, the camera (proof-of-delivery photo) and GPS (live rider location)
on an `https://` address, so `http://192.168.x.x:3000` is not enough. A free Cloudflare quick tunnel
gives the laptop a temporary HTTPS address any phone can open, on any network:

```bash
winget install Cloudflare.cloudflared   # once
cd web && npm run tunnel                # prints https://<random-words>.trycloudflare.com
```

Keep the web app (`npm run dev`) and Docker running. On the phone, open the printed address and log in:

- **Android (Chrome):** tap **Install** on the "Get the Feasto app" card, or Account → Install the Feasto app.
- **iPhone (Safari):** Share → **Add to Home Screen** (Account → Install the Feasto app shows the steps).

The address changes every time the tunnel restarts, so install the app again on demo day.
Anyone with the address can open the site while the tunnel runs; stop it with Ctrl+C when done.

## Demo data (before a presentation)

One command wipes **everything** (all accounts, stores, orders, photos, carts) and loads a clean
demo: 10 stores in Naval, Biliran (on real streets, with map pins) with real food photos and menus,
2 stores waiting for approval, riders, residents, two weeks of orders with ratings, live orders
waiting right now, and table bookings.

```bash
docker compose --profile tools run --rm --build demo
```

Every demo account uses the password **`demo1234`** (the admin keeps the password from `.env`).
The permits and licenses in the demo are made-up samples marked SAMPLE ONLY (`server/demo/documents`).

| Role | Email | What to show |
|---|---|---|
| Admin | `admin@feasto.com` | 3 approvals waiting, 1 renewal to check, expired and expiring documents, stuck orders, activity log, settings, sales chart, reports, system monitor, disable a user |
| Resident | `juan@feasto.com` | Saved stores, an order being prepared with rider Jessa on the live map, past orders to rate and order again, a table booking |
| Vendor | `nena@feasto.com` | Aling Nena's Carinderia: 2 new orders waiting, sales chart, ratings; own riders: Mark approved, Leo waiting for approval |
| Vendor | `remy@feasto.com` | Lola Remy's Kitchen: tables and bookings, a ready order waiting for a rider |
| Rider | `pedro@feasto.com` | Online, 2 ready jobs waiting, earnings history |

Orders the store doesn't accept, and jobs no rider takes, are cancelled by themselves after 10 minutes (Admin → Settings), so the waiting orders and jobs above are there for about 9 minutes after the reset. To show them later, place a new order.

Other demo accounts: vendors `marco@`, `bea@`, `ramon@`, `kim@`, `ben@`, `sofia@`, `lorna@`, `carlos@`;
free riders `jessa@` (license expiring soon), `ariel@` (license expired) and `rico@` (pending); Aling Nena's riders `mark@` and `leo@` (pending); residents `maria@`, `carlo@`, `andrea@`,
`miguel@`, `patricia@` (all `@feasto.com`). Pending stores: `tonyo@`, `grace@`.

Food photos come from [TheMealDB](https://www.themealdb.com) and [TheCocktailDB](https://www.thecocktaildb.com),
used for this school project (`server/demo/photos`).

## Real Naval stores and deployment

- `docker compose --profile tools run --rm --build naval` replaces everything with the 39 real food
  stores of Naval (menus, photos, hours, map pins). Details and store log-ins: [server/naval/README.md](server/naval/README.md).
- For a class to use it at once, either the laptop as the server on one WiFi (`.\infra\lan\start.ps1`) or a cloud server with HTTPS: [DEPLOY.md](DEPLOY.md).

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
| **Fault tolerance** | Nginx skips a dead copy; workers share queues and a crashed worker is started again; heartbeats | `docker compose stop api-2` while using the app, open Admin → System, then `docker compose start api-2`. For a worker: `docker compose exec worker pkill -f dist/worker.js` and watch it come back |
| **Stateless sessions** | Signed login cookie that every copy can check | The `X-Served-By` header changes between requests while you stay logged in |
| **Parallel processing** | One worker process per CPU (`server/src/workers.ts`, `os.availableParallelism()`; `WORKER_COUNT` in `.env` overrides it), each handling 5 jobs at once | Admin → System shows "One worker per CPU". Order from 3 stores in one checkout: all 3 stores are notified in ~1× the time, not 3× |
| **Map-reduce** | Sales report split into one job per store, combined at the end | Admin → Reports: "Computed in 0.96 s · 19 store jobs on worker-1 to worker-4" |
| **Message queue + outbox** | Checkout writes events in the same DB transaction; workers relay them to RabbitMQ | Admin → System shows queues and "events waiting to be sent" |
| **Auto-cancel (self-healing)** | Every worker checks every 15 s for orders no store accepted, or no rider took, within the admin's time (10 min); one worker cancels each (conditional update), puts the stock back, refunds and tells the resident and the store | Place an order and don't accept it: after 10 minutes it's cancelled and both get a notification. Admin → Activity log shows "Feasto (automatic)" |
| **Saga (distributed transaction)** | Online payment fails → orders cancelled and stock restored automatically | At checkout choose Online payment and turn on "Demo: make the payment fail" |
| **Idempotency** | Each checkout carries a one-time key | Double-clicking "Place order" never creates two orders |
| **Concurrency control** | Conditional updates and unique indexes | 10 buyers for the last item → 1 order; 5 riders accept one job → 1 gets it; 100 bookings for one table → 1 (`loadtest/booking-race.js`) |
| **Proximity dispatch** | A store's riders get its job first (1 minute by default), then the 3 nearest free riders, after a wait the next 5, after another wait everyone. The admin sets both waits in Settings. Rider positions live in a Redis geo index; each job's next step is in PostgreSQL, and workers claim due steps with `SKIP LOCKED` | Two riders use "Demo: place me at the map's center" near and far from a store; accept an order as the vendor: the near one gets it first. `docker compose logs -f worker` shows each step and which worker took it. Kill one mid-way (`docker compose exec worker pkill -o -f dist/worker.js`): the others carry on and it starts again |
| **Distributed lock** | Redis `SET NX` per rider | A rider can't grab two jobs with quick double taps |
| **Paging and spatial queries** | Rider jobs are filtered, sorted by distance and paged inside PostgreSQL; the store list is paged from the Redis cache; both maps load only what's on screen | Rider → Home shows the 3 nearest jobs, "See all" → sort/"Within 2 km"/"Show more"; pan the Map and watch it load only that area |
| **Shared cache** | Store list and menus cached in Redis, cleared on change | Edit a price as a vendor; every API copy shows the new price immediately |
| **Real-time over pub/sub** | Server-Sent Events + Redis pub/sub across API copies | Keep the resident's order page open while the vendor accepts; it updates without refreshing |
| **Shared state** | Cart and login lockout counter in Redis | 5 wrong passwords across different copies still lock the account |
| **Session revocation** | Logins are stateless signed cookies, so disabled accounts are kept in a Redis set that all 3 API copies check on every request | Admin → Users → Disable a resident who is logged in elsewhere: their open page logs out within a second |
| **Atomic counters** | Each rating updates the store's rating total in the same transaction; a unique index allows one rating per order | Rate an order from two tabs at once: only one rating is saved |
| **Shared file storage** | Photos on a Docker volume used by all copies, served by Nginx | Upload a dish photo; it loads no matter which copy serves the page |
| **Shared settings** | The delivery prices and wave timings are in PostgreSQL with a copy in Redis. Saving clears that copy for all 3 API copies and both workers at once | Admin → Settings: change the fee and open the cart. The next job's waves use the new timing right away |
| **Once-only background checks** | Both workers check expiring documents and stuck orders each minute. `UPDATE ... RETURNING` and Redis `SET NX` make sure each reminder or action still happens once | Admin → Stuck orders shows waiting orders; with two workers running, the admin's notification arrives once |
| **One admin, enforced by the database** | A partial unique index on `User.role` refuses a second admin, however it's attempted | In `psql`, try to make another user an admin: PostgreSQL refuses |
| **Private shared files** | Permits and licenses on a second volume that all API copies share but Nginx can't see; each download goes through a permission check | Admin → Approvals opens a license; a different store gets "not found" for the same link |
