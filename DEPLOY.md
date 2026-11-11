# Deploying Feasto to a cloud server

This puts the whole system on one Linux server with HTTPS, so everyone opens the same address on
their phone or laptop. The laptop doesn't have to stay on.

```
Phones / laptops ──HTTPS──► Caddy (ports 80, 443; gets the certificate by itself)
                              ├── /api, /uploads ──► Nginx ──► api-1, api-2, api-3
                              └── everything else ──► web (Next.js)
           api-1..3 and the workers share Postgres, Redis and RabbitMQ (not reachable from outside)
```

## 1. Create the server

Any provider works. With a student account:

- **Azure for Students** ($100 credit, no credit card): Virtual machines → Create.
- **DigitalOcean** (GitHub Student Pack credit): Droplets → Create.

Choose:

| Setting | Value |
|---|---|
| Image | Ubuntu 24.04 LTS |
| Size | **2 vCPU / 4 GB RAM at least** (4 vCPU / 8 GB if the credit allows; the workers follow the CPU count) |
| Disk | 30 GB or more |
| Inbound ports | 22 (SSH), 80 (HTTP), 443 (HTTPS) |
| Login | SSH key or password |

Write down the server's **public IP address**, e.g. `203.0.113.10`.

## 2. Install Docker

```bash
ssh azureuser@203.0.113.10            # or root@… on DigitalOcean
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER && newgrp docker

# 2 GB of swap, so building the web app never runs out of memory
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

## 3. Get the code

```bash
git clone https://github.com/KurtSalut29/Feasto.git
cd Feasto
```

If the repository is private, GitHub asks for a username and a **personal access token**
(GitHub → Settings → Developer settings → Personal access tokens) instead of the password.

## 4. Settings (`.env`)

Create `.env` in the `Feasto` folder. **Never commit this file.**

```bash
nano .env
```

```ini
# The address people open. <IP>.sslip.io works without buying a domain.
SITE_ADDRESS=203.0.113.10.sslip.io

# Make new secrets for the server (don't reuse the laptop's):  openssl rand -hex 32
JWT_SECRET=paste-a-long-random-value
ADMIN_EMAIL=admin@feasto.com
ADMIN_PASSWORD=choose-a-strong-password
# Password of every store's log-in (see server/naval/README.md)
STORE_PASSWORD=choose-another-password

# Same token as on the laptop (road distances and the maps)
MAPBOX_TOKEN=pk.…
```

If the Mapbox token has **URL restrictions**, add `https://203.0.113.10.sslip.io` to it in the
Mapbox dashboard, or the maps stay blank.

## 5. Start it

Every command below uses both compose files. A short alias saves typing:

```bash
alias dc='docker compose -f docker-compose.yml -f docker-compose.prod.yml'
echo "alias dc='docker compose -f docker-compose.yml -f docker-compose.prod.yml'" >> ~/.bashrc

dc up -d --build                                # first time takes 5–10 minutes
dc --profile tools run --rm --build naval       # the admin and the 39 Naval stores
dc ps                                           # everything should say "running" / "healthy"
```

Open **https://203.0.113.10.sslip.io**, log in as the admin and check a few stores. The first
visit can take a few seconds while Caddy gets the certificate.

`naval` wipes the database before loading the stores. Run it once, not after people have signed
up. (The demo data is still there: `dc --profile tools run --rm --build demo`.)

## 6. Before the class test

1. **Practice run** with 3–5 people: sign up, order from a store, have a store accept it,
   have a rider deliver it.
2. **Load test** from the server, so you know it holds 50 people at once:

   ```bash
   docker run --rm --network feasto_default -v "$PWD/loadtest:/scripts" grafana/k6:1.3.0 run -e VUS=50 /scripts/browse.js
   ```

   It signs up test accounts, so run `naval` again afterwards to start clean (before anyone real signs up).

3. **People to approve**: classmates who sign up as riders wait for the admin (or their store).
   Have someone logged in as the admin during the test.
4. **Store log-ins**: hand out the store accounts from `server/naval/README.md` to whoever plays
   each store.

## 7. Backups

Data lives in Docker volumes and survives restarts and updates. A daily copy of the database
protects it from mistakes:

```bash
mkdir -p ~/backups
crontab -e
# add this line: every day at 3 AM, keep 14 days
0 3 * * * cd ~/Feasto && docker compose exec -T postgres pg_dump -U feasto feasto | gzip > ~/backups/feasto-$(date +\%F).sql.gz && find ~/backups -name '*.sql.gz' -mtime +14 -delete
```

Make one by hand right before the test too:

```bash
dc exec -T postgres pg_dump -U feasto feasto | gzip > ~/backups/before-test.sql.gz
```

Restore one (this replaces the current data):

```bash
dc stop api-1 api-2 api-3 worker web
dc exec -T postgres psql -U feasto -d postgres -c "DROP DATABASE feasto WITH (FORCE)" -c "CREATE DATABASE feasto"
gunzip -c ~/backups/before-test.sql.gz | dc exec -T postgres psql -U feasto -d feasto
dc up -d
```

## 8. Updating after a change

```bash
cd ~/Feasto && git pull && dc up -d --build
```

Database migrations run by themselves. Data is kept.

**Only these delete data:** `dc down -v` (the `-v` removes the volumes), `naval` and `demo`.

## Troubleshooting

| Problem | Look at |
|---|---|
| Site doesn't open | `dc ps`; ports 80 and 443 open in the provider's firewall; `dc logs caddy` |
| "Feasto is having trouble" | `dc logs --tail 100 api-1 worker` |
| Login works but you're logged out right away | the site must be opened with `https://` (cookies are HTTPS-only) |
| Maps are blank | `MAPBOX_TOKEN` in `.env`, then `dc up -d --build web`; the token's URL restrictions |
| Server feels slow | `docker stats`; a bigger server size; `WORKER_COUNT` in `.env` |
