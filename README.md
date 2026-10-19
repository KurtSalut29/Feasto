# Feasto

A Parallel and Distributed Multi-Vendor Food Ordering and Booking System.

## Project layout

| Folder | What it is |
|---|---|
| `web/` | Next.js app for all users: Resident, Rider, Vendor and Admin |
| `server/` | Backend in Node.js + TypeScript: the REST API (`src/api.ts`) and the background worker (`src/worker.ts`) |
| `server/prisma/` | Database schema and migrations (Prisma + PostgreSQL) |
| `infra/nginx/` | Load balancer config that spreads requests across the API copies |
| `docker-compose.yml` | Starts the whole backend with one command |

## Architecture

```
Browser ──► Nginx :8080 ──► api-1 ┐
                       ├──► api-2 ├──► PostgreSQL (data)
                       └──► api-3 ┘    Redis (cache, locks)
                                  │
                                  └──► RabbitMQ ──► worker (parallel jobs)
```

## Requirements

- Node.js 24+
- Docker Desktop (it must show "Engine running")

## Running the backend

```bash
docker compose up -d --build     # build and start everything
docker compose ps                # see what is running
docker compose logs -f worker    # follow the logs of one service
docker compose down              # stop everything (data is kept)
```

Check it works: open http://localhost:8080/api/health and refresh a few times.
The `instance` value changes between `api-1`, `api-2` and `api-3`, because Nginx is load balancing.

RabbitMQ dashboard: http://localhost:15672 (user `feasto`, password `feasto`).

## Running the web app

```bash
cd web
npm install
npm run dev                      # http://localhost:3000
```

## Working on the backend without Docker rebuilds

Keep `postgres`, `redis` and `rabbitmq` running in Docker and run the API on your machine with live reload:

```bash
cd server
cp .env.example .env             # first time only
npm install
npm run dev:api                  # http://localhost:4000/api/health
npm run dev:worker               # in a second terminal
```

After changing `server/prisma/schema.prisma`:

```bash
npm run db:migrate -- --name describe_the_change
```

## Demos for the defense

- **Load balancing:** refresh `/api/health` and watch `instance` rotate.
- **Fault tolerance:** `docker compose stop api-2`, keep refreshing (it still works), then `docker compose start api-2`.
