"""
Race conditions: what happens when many people do the same thing at the same instant.

Each test sets something up, then releases all its requests at once (a thread barrier lets them go
together) and checks the database afterwards: the answer has to be right no matter which of the
three API copies each request landed on or in what order they arrived.

    python loadtest/races.py

Run it from the Feasto folder while the classroom setup is up (infra/lan/start.ps1). It needs only
Python and Docker: it reads the database through `docker exec`. It makes its own store, residents
and riders (emails ending in @race.test) and deletes all of them at the end, so nothing of yours
changes. Results are also saved to loadtest/results/races.json.
"""

import json, os, subprocess, sys, threading, time, urllib.error, urllib.request, uuid
from datetime import datetime, timedelta, timezone

API = os.environ.get("API", "http://127.0.0.1:8081/api")  # Caddy's plain door, the same path the tunnel uses
RUN = datetime.now().strftime("%H%M%S")
DOMAIN = "@race.test"
PASSWORD = "demo1234"
RESIDENTS, RIDERS = 30, 8
results = []


# ---------- Plumbing ----------

def sql(query):
    out = subprocess.run(["docker", "exec", "-i", "feasto-postgres-1", "psql", "-U", "feasto", "-d", "feasto", "-tA", "-v", "ON_ERROR_STOP=1"],
                         input=query, capture_output=True, text=True, encoding="utf-8")
    if out.returncode:
        raise RuntimeError(out.stderr.strip())
    return out.stdout.strip()

def one(query):
    return sql(query).splitlines()[0] if sql(query) else ""

def call(method, path, body=None, cookie=None):
    headers = {"Content-Type": "application/json"}
    if cookie:
        headers["cookie"] = f"feasto_session={cookie}"
    req = urllib.request.Request(API + path, method=method, headers=headers, data=None if body is None else json.dumps(body).encode())
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            raw = r.read()
            return r.status, json.loads(raw) if raw else {}, r.headers.get("set-cookie", "")
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw) if raw else {}, ""
        except ValueError:
            return e.code, {"error": raw.decode()[:200]}, ""

def at_once(requests):
    """Sends every (method, path, body, cookie) at the same instant; returns the answers in order."""
    answers = [None] * len(requests)
    gate = threading.Barrier(len(requests))
    def go(i, req):
        gate.wait()
        answers[i] = call(*req)
    threads = [threading.Thread(target=go, args=(i, r)) for i, r in enumerate(requests)]
    for t in threads: t.start()
    for t in threads: t.join()
    return answers

def login(email):
    status, _, cookie = call("POST", "/auth/login", {"email": email, "password": PASSWORD})
    assert status == 200, f"{email} couldn't log in ({status})"
    return cookie.split("feasto_session=")[1].split(";")[0]

def codes(answers):
    seen = {}
    for status, *_ in answers:
        seen[status] = seen.get(status, 0) + 1
    return dict(sorted(seen.items()))

def report(name, what, expected, actual, ok):
    results.append({"test": name, "what": what, "expected": expected, "actual": actual, "passed": bool(ok)})
    print(f"  {'PASS' if ok else 'FAIL'}  {name}\n        expected: {expected}\n        got:      {actual}")

def unthrottle():
    """The tests reuse accounts, so the per-account limits on checkout are reset between them."""
    keys = subprocess.run(["docker", "exec", "feasto-redis-1", "redis-cli", "--scan", "--pattern", "rate:*"], capture_output=True, text=True).stdout.split()
    for key in keys:
        subprocess.run(["docker", "exec", "feasto-redis-1", "redis-cli", "DEL", key], capture_output=True)


# ---------- The test store, residents and riders ----------

def ids(prefix, n):
    return [f"rt{RUN}{prefix}{i:02d}" for i in range(n)]

RES, RID, OWNER, STORE = ids("res", RESIDENTS), ids("rid", RIDERS), f"rt{RUN}owner", f"rt{RUN}store"

def create_fixtures():
    hash_ = one("SELECT \"passwordHash\" FROM \"User\" WHERE email LIKE '%@sample.feasto.com' LIMIT 1")
    if not hash_:
        sys.exit("Run the sample history first (it makes accounts whose password this test reuses).")
    users = [(OWNER, f"owner.{RUN}{DOMAIN}", "Race Owner", "VENDOR")]
    users += [(u, f"resident{i}.{RUN}{DOMAIN}", f"Racer {i + 1}", "RESIDENT") for i, u in enumerate(RES)]
    users += [(u, f"rider{i}.{RUN}{DOMAIN}", f"Race Rider {i + 1}", "RIDER") for i, u in enumerate(RID)]
    values = ",".join(f"('{u}','{e}','{hash_}','{n}','09170000000','{r}')" for u, e, n, r in users)
    sql(f"""
      INSERT INTO "User" (id, email, "passwordHash", name, phone, role) VALUES {values};
      INSERT INTO "Vendor" (id, "ownerId", name, "storeType", address, latitude, longitude, "riderCode", status, "opensAt", "closesAt", "acceptsReservations")
        VALUES ('{STORE}', '{OWNER}', 'Race Test Kitchen {RUN}', 'RESTAURANT', 'Naval, Biliran', 11.5618, 124.3965, 'RACE{RUN}', 'APPROVED', '00:00', '24:00', true);
      INSERT INTO "DiningTable" (id, "vendorId", label, seats) VALUES ('{STORE}t1', '{STORE}', 'Table 1', 4);
      INSERT INTO "Address" (id, "userId", label, details, latitude, longitude, "isDefault")
        SELECT id || 'a', id, 'Home', 'Naval, Biliran', 11.5650, 124.3990, true FROM "User" WHERE id IN ({",".join(f"'{u}'" for u in RES)});
      INSERT INTO "RiderProfile" (id, "userId", "vehicleModel", "plateNumber", "licenseNumber", "licenseExpiresAt", status, "isOnline")
        SELECT id || 'p', id, 'Honda Click', 'RACE', 'L-' || id, '2035-12-31', 'APPROVED', true FROM "User" WHERE id IN ({",".join(f"'{u}'" for u in RID)});
    """)

def dish(name, stock):
    """A dish of the test store with this much stock (None = unlimited); returns its id."""
    dish_id = f"rt{RUN}d{uuid.uuid4().hex[:8]}"
    sql(f"""INSERT INTO "MenuItem" (id, "vendorId", name, price, stock) VALUES ('{dish_id}', '{STORE}', '{name}', 50, {stock if stock is not None else 'NULL'})""")
    return dish_id

def fill_cart(cookie, dish_id, quantity=1):
    call("DELETE", "/cart", cookie=cookie)
    status, body, _ = call("PUT", "/cart/items", {"menuItemId": dish_id, "quantity": quantity}, cookie)
    assert status == 200, body

def checkout_body(**extra):
    return {"idempotencyKey": str(uuid.uuid4()), "fulfillment": "PICKUP", "paymentMethod": "COD", **extra}

def order_row(status, resident, rider=None, fulfillment="PICKUP", **extra):
    """An order made straight in the database, for tests that start from a later step."""
    oid = f"rt{RUN}o{uuid.uuid4().hex[:10]}"
    sql(f"""
      INSERT INTO "Checkout" (id, "residentId", fulfillment, "paymentMethod", total, "paymentStatus", "idempotencyKey", "deliveryAddress", "deliveryLat", "deliveryLng")
        VALUES ('{oid}c', '{resident}', '{fulfillment}', 'COD', 100, 'PENDING', '{oid}', 'Naval, Biliran', 11.565, 124.399);
      INSERT INTO "Order" (id, "checkoutId", "vendorId", "riderId", status, fulfillment, subtotal, "deliveryFee", dispatch, "acceptedAt", "finishedAt", "updatedAt")
        VALUES ('{oid}', '{oid}c', '{STORE}', {f"'{rider}'" if rider else 'NULL'}, '{status}', '{fulfillment}', 100, {extra.get('fee', 0)}, '{extra.get('dispatch', 'NEW')}',
                now(), {'now()' if status in ('DELIVERED', 'COMPLETED') else 'NULL'}, now());
    """)
    return oid

def cleanup():
    people = ",".join(f"'{u}'" for u in [OWNER, *RES, *RID])
    sql(f"""
      DELETE FROM "Notification" WHERE "userId" IN ({people});
      DELETE FROM "RiderRating" WHERE "residentId" IN ({people}) OR "riderId" IN ({people});
      DELETE FROM "Review" WHERE "vendorId" = '{STORE}';
      DELETE FROM "JobOffer" WHERE "riderId" IN ({people}) OR "orderId" IN (SELECT id FROM "Order" WHERE "vendorId" = '{STORE}');
      DELETE FROM "OrderItem" WHERE "orderId" IN (SELECT id FROM "Order" WHERE "vendorId" = '{STORE}');
      DELETE FROM "Order" WHERE "vendorId" = '{STORE}';
      DELETE FROM "Checkout" WHERE "residentId" IN ({people});
      DELETE FROM "Booking" WHERE "residentId" IN ({people});
      DELETE FROM "DiningTable" WHERE "vendorId" = '{STORE}';
      DELETE FROM "MenuItem" WHERE "vendorId" = '{STORE}';
      DELETE FROM "Favorite" WHERE "userId" IN ({people});
      DELETE FROM "Address" WHERE "userId" IN ({people});
      DELETE FROM "RiderProfile" WHERE "userId" IN ({people});
      DELETE FROM "Vendor" WHERE id = '{STORE}';
      DELETE FROM "User" WHERE id IN ({people});
    """)
    for pattern in ("cart:rt" + RUN + "*", "cart-notes:rt" + RUN + "*"):
        for key in subprocess.run(["docker", "exec", "feasto-redis-1", "redis-cli", "--scan", "--pattern", pattern], capture_output=True, text=True).stdout.split():
            subprocess.run(["docker", "exec", "feasto-redis-1", "redis-cli", "DEL", key], capture_output=True)
    unthrottle()


# ---------- The tests ----------

def last_plate(res):
    d = dish("Last Plate Adobo", 1)
    for c in res: fill_cart(c, d)
    answers = at_once([("POST", "/checkout", checkout_body(), c) for c in res])
    orders = int(one(f"""SELECT count(*) FROM "OrderItem" WHERE "menuItemId" = '{d}'"""))
    stock = int(one(f"""SELECT stock FROM "MenuItem" WHERE id = '{d}'"""))
    report("1. The last plate", f"{len(res)} residents order the last plate at the same instant",
           "1 order, the rest told it sold out, stock 0", f"{orders} order(s), answers {codes(answers)}, stock {stock}", orders == 1 and stock == 0)

def ten_plates(res):
    d = dish("Ten Plates Sinigang", 10)
    for c in res: fill_cart(c, d)
    answers = at_once([("POST", "/checkout", checkout_body(), c) for c in res])
    sold = int(one(f"""SELECT coalesce(sum(quantity), 0) FROM "OrderItem" WHERE "menuItemId" = '{d}'"""))
    stock = int(one(f"""SELECT stock FROM "MenuItem" WHERE id = '{d}'"""))
    report("2. Ten plates, thirty buyers", f"{len(res)} residents order from a stock of 10 at once",
           "exactly 10 sold, stock 0 (never below)", f"{sold} sold, answers {codes(answers)}, stock {stock}", sold == 10 and stock == 0)

def double_tap(cookie, resident_id):
    d = dish("Double Tap Tapsilog", None)
    fill_cart(cookie, d)
    body = checkout_body()
    answers = at_once([("POST", "/checkout", body, cookie)] * 8)
    made = int(one(f"""SELECT count(*) FROM "Checkout" WHERE "idempotencyKey" = '{body["idempotencyKey"]}'"""))
    same = {a[1].get("checkoutId") for a in answers if a[0] in (200, 201)}
    report("3. Place order tapped 8 times", "The same checkout (same key) sent 8 times at once, like a double-tap on a slow phone",
           "1 checkout; every answer points to it", f"{made} checkout(s), answers {codes(answers)}, {len(same)} distinct checkout id(s)", made == 1 and len(same) == 1)

def accept_vs_cancel(res, owner):
    d = dish("Accept Or Cancel Lomi", 100)
    orders = []
    for c in res:
        fill_cart(c, d)
        status, body, _ = call("POST", "/checkout", checkout_body(), c)
        assert status == 201, body
        orders.append((body["orderIds"][0], c))
    time.sleep(2)  # the stores are told; both buttons are now on screen
    requests = []
    for oid, c in orders:
        requests += [("POST", f"/vendor/orders/{oid}/accept", {}, owner), ("POST", f"/orders/{oid}/cancel", {}, c)]
    answers = at_once(requests)
    both_won = sum(1 for i in range(0, len(answers), 2) if answers[i][0] == 200 and answers[i + 1][0] == 200)
    none_won = sum(1 for i in range(0, len(answers), 2) if answers[i][0] != 200 and answers[i + 1][0] != 200)
    states = dict(x.split("|") for x in sql(f"""SELECT status, count(*) FROM "Order" WHERE id IN ({",".join(f"'{o}'" for o, _ in orders)}) GROUP BY status""").splitlines())
    accepted = int(states.get("ACCEPTED", 0))
    stock = int(one(f"""SELECT stock FROM "MenuItem" WHERE id = '{d}'"""))
    report("4. Store accepts while the resident cancels", f"{len(orders)} orders; on each, the store taps Accept and the resident taps Cancel at the same instant",
           "on every order exactly one of them wins; stock goes back only for the cancelled ones",
           f"{dict(states)}, both won on {both_won}, neither on {none_won}; stock {stock} (expected {100 - accepted})",
           both_won == 0 and none_won == 0 and stock == 100 - accepted)

def riders_one_job(riders, res_id):
    oid = order_row("ACCEPTED", res_id, fulfillment="DELIVERY", dispatch="EVERYONE", fee=49)
    answers = at_once([("POST", f"/rider/jobs/{oid}/accept", {}, r) for r in riders])
    holder = one(f"""SELECT "riderId" FROM "Order" WHERE id = '{oid}'""")
    winners = [i for i, a in enumerate(answers) if a[0] == 200]
    report("5. Eight riders, one job", f"{len(riders)} riders tap Accept on the same delivery at once",
           "1 rider gets it, the others are told another rider took it", f"{len(winners)} got it, answers {codes(answers)}, held by {'the winner' if winners and holder == RID[winners[0]] else holder}",
           len(winners) == 1 and holder == RID[winners[0]])

def one_rider_five_jobs(rider, res_id):
    jobs = [order_row("ACCEPTED", res_id, fulfillment="DELIVERY", dispatch="EVERYONE", fee=49) for _ in range(5)]
    answers = at_once([("POST", f"/rider/jobs/{j}/accept", {}, rider) for j in jobs])
    held = int(one(f"""SELECT count(*) FROM "Order" WHERE "riderId" = '{RID[-1]}'"""))
    report("6. One rider, five jobs at once", "A rider taps Accept on 5 jobs in the same instant (one delivery at a time is the rule)",
           "1 job taken, 4 refused", f"{held} taken, answers {codes(answers)}", held == 1)

def rate_twice(cookie, res_id):
    oid = order_row("COMPLETED", res_id)
    before = one(f"""SELECT "ratingSum" || '/' || "ratingCount" FROM "Vendor" WHERE id = '{STORE}'""")
    answers = at_once([("POST", f"/orders/{oid}/review", {"rating": 5}, cookie)] * 10)
    reviews = int(one(f"""SELECT count(*) FROM "Review" WHERE "orderId" = '{oid}'"""))
    after = one(f"""SELECT "ratingSum" || '/' || "ratingCount" FROM "Vendor" WHERE id = '{STORE}'""")
    report("7. Rating the store from 10 tabs", "The same order rated 10 times at once",
           "1 review; the store's stars go up once (0/0 to 5/1)", f"{reviews} review(s), answers {codes(answers)}, stars {before} to {after}", reviews == 1 and after == "5/1")

def tip_twice(cookie, res_id):
    oid = order_row("DELIVERED", res_id, rider=RID[0], fulfillment="DELIVERY", fee=49)
    answers = at_once([("POST", f"/orders/{oid}/rider-rating", {"rating": 5, "tip": 20, "tipMethod": "GCASH"}, cookie)] * 10)
    rated = int(one(f"""SELECT count(*) FROM "RiderRating" WHERE "orderId" = '{oid}'"""))
    tip = one(f"""SELECT tip FROM "Order" WHERE id = '{oid}'""")
    totals = one(f"""SELECT "ratingSum" || '/' || "ratingCount" FROM "RiderProfile" WHERE "userId" = '{RID[0]}'""")
    report("8. Tipping the rider from 10 tabs", "The same rider rated and tipped ₱20 ten times at once",
           "1 rating, the tip paid once (₱20), the rider's stars up once", f"{rated} rating(s), answers {codes(answers)}, tip ₱{tip}, stars {totals}",
           rated == 1 and float(tip) == 20 and totals == "5/1")

def one_table(res):
    tomorrow = (datetime.now(timezone(timedelta(hours=8))) + timedelta(days=1)).strftime("%Y-%m-%d")
    answers = at_once([("POST", "/bookings", {"vendorId": STORE, "date": tomorrow, "time": "19:00", "partySize": 2}, c) for c in res])
    booked = int(one(f"""SELECT count(*) FROM "Booking" WHERE "tableId" = '{STORE}t1' AND status = 'CONFIRMED'"""))
    report("9. One table, thirty people", f"{len(res)} residents book the only table for the same time at once",
           "1 booking, the rest told the time is taken", f"{booked} booking(s), answers {codes(answers)}", booked == 1)

def scheduled_once(res, workers):
    d = dish("Scheduled Pancit", None)
    slot = (datetime.now(timezone.utc) + timedelta(minutes=90)).replace(second=0, microsecond=0)
    slot += timedelta(minutes=(15 - slot.minute % 15) % 15)
    orders = []
    for c in res:
        fill_cart(c, d)
        status, body, _ = call("POST", "/checkout", checkout_body(scheduledFor=slot.isoformat().replace("+00:00", "Z")), c)
        assert status == 201, body
        orders.append(body["orderIds"][0])
    listed = ",".join(f"'{o}'" for o in orders)
    sql(f"""UPDATE "Order" SET "scheduledFor" = now() + interval '10 minutes' WHERE id IN ({listed})""")  # their time is near
    for _ in range(40):
        time.sleep(1)
        if one(f"""SELECT count(*) FROM "Order" WHERE id IN ({listed}) AND status = 'PLACED'""") == str(len(orders)):
            break
    time.sleep(4)
    placed = int(one(f"""SELECT count(*) FROM "Order" WHERE id IN ({listed}) AND status = 'PLACED'"""))
    told = [int(one(f"""SELECT count(*) FROM "Notification" WHERE "userId" = '{OWNER}' AND title LIKE 'Scheduled order #{o[-6:].upper()} for%' AND body LIKE '%Accept it now%'""")) for o in orders]
    report("10. Scheduled orders with several workers", f"{len(orders)} scheduled orders come due together while {workers} worker processes all look for due orders",
           "each order sent to the store once: the store told once per order", f"{placed} sent; the store was told {told} times",
           placed == len(orders) and all(n == 1 for n in told))

def pay_vs_cancel(res):
    d = dish("Pay Or Cancel Bulalo", 100)
    pairs = []
    for c in res:
        fill_cart(c, d)
        pairs.append((c, checkout_body(paymentMethod="ONLINE", onlineMethod="GCASH")))
    made = at_once([("POST", "/checkout", body, c) for c, body in pairs])
    oids = [m[1]["orderIds"][0] for m in made]
    at_once([("POST", f"/orders/{o}/cancel", {}, c) for o, (c, _) in zip(oids, pairs)])  # while the payment is still going through
    time.sleep(6)
    listed = ",".join(f"'{o}'" for o in oids)
    rows = sql(f"""SELECT o.status || ' ' || c."paymentStatus" FROM "Order" o JOIN "Checkout" c ON c.id = o."checkoutId" WHERE o.id IN ({listed})""").splitlines()
    kept = sum(1 for r in rows if r.startswith("CANCELLED") and r.endswith("PAID"))
    stock = int(one(f"""SELECT stock FROM "MenuItem" WHERE id = '{d}'"""))
    states = {r: rows.count(r) for r in set(rows)}
    report("11. Cancel while the online payment goes through", f"{len(oids)} residents pay with GCash and cancel in the same moment",
           "no one is charged for a cancelled order; all stock back (100)", f"{states}, charged for a cancelled order: {kept}, stock {stock}", kept == 0 and stock == 100)

def chat_burst(res_cookie, owner, res_id):
    oid = order_row("ACCEPTED", res_id)
    sends = [("POST", f"/chat/{oid}", {"body": f"resident {i}"}, res_cookie) for i in range(10)]
    sends += [("POST", f"/chat/{oid}", {"body": f"store {i}"}, owner) for i in range(10)]
    answers = at_once(sends)
    saved = int(one(f"""SELECT count(*) FROM "OrderMessage" WHERE "orderId" = '{oid}'"""))
    report("12. Twenty chat messages at once", "The resident and the store each send 10 messages in the same instant",
           "all 20 saved, none lost", f"{saved} saved, answers {codes(answers)}", saved == 20)


def main():
    # The worker processes in the worker container (one per CPU), each looking for due scheduled orders
    listing = subprocess.run(["docker", "exec", "feasto-worker-1", "ps", "-o", "args"], capture_output=True, text=True).stdout.splitlines()
    workers = sum(1 for line in listing if line.strip().endswith("/app/dist/worker.js"))
    print(f"Race tests, run {RUN}: making a test store, {RESIDENTS} residents and {RIDERS} riders…")
    create_fixtures()
    try:
        unthrottle()
        res = [login(f"resident{i}.{RUN}{DOMAIN}") for i in range(RESIDENTS)]
        riders = [login(f"rider{i}.{RUN}{DOMAIN}") for i in range(RIDERS)]
        owner = login(f"owner.{RUN}{DOMAIN}")
        print()
        last_plate(res)
        ten_plates(res)
        double_tap(res[29], RES[29])
        unthrottle()
        accept_vs_cancel(res[:15], owner)
        riders_one_job(riders[:-1] if RIDERS > 1 else riders, RES[0])
        one_rider_five_jobs(riders[-1], RES[0])
        rate_twice(res[1], RES[1])
        tip_twice(res[2], RES[2])
        one_table(res)
        unthrottle()
        scheduled_once(res[15:25], workers or 1)
        unthrottle()
        pay_vs_cancel(res[:10])
        chat_burst(res[3], owner, RES[3])
    finally:
        cleanup()
    passed = sum(r["passed"] for r in results)
    print(f"\n{passed} of {len(results)} passed. Test data removed.")
    os.makedirs(os.path.join(os.path.dirname(__file__), "results"), exist_ok=True)
    with open(os.path.join(os.path.dirname(__file__), "results", "races.json"), "w", encoding="utf-8") as f:
        json.dump({"run": datetime.now().isoformat(timespec="seconds"), "passed": passed, "total": len(results), "results": results}, f, indent=2, ensure_ascii=False)
    sys.exit(0 if passed == len(results) else 1)


if __name__ == "__main__":
    main()
