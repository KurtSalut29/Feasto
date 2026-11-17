"""
Functional and integration tests: one full order from start to finish, plus the parts that make
Feasto distributed (load balancing, failover, the queue, the workers, live updates).

    python loadtest/functional.py

Run it from the Feasto folder while the classroom setup is up (infra/lan/start.ps1). Like races.py,
it makes its own store, residents and riders (emails ending in @race.test) and deletes all of them
at the end, so nothing of yours changes. Two tests briefly stop things on purpose and start them
again: api-2 (Nginx must send everyone to api-1 and api-3) and one worker process (it must come back).
Results go to loadtest/results/functional.json.
"""

import json, os, subprocess, sys, threading, time, urllib.error, urllib.parse, urllib.request
from collections import Counter
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(__file__))
import races as R  # the same plumbing, test store and clean-up as the race tests

API = R.API
results = []
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PIN = os.path.join(ROOT, "web", "public", "icons", "rider-pin.webp")  # any real photo works as "proof of delivery"
uploaded = []


def check(group, name, what, expected, actual, ok, ms=None):
    results.append({"group": group, "test": name, "what": what, "expected": expected, "actual": actual, "passed": bool(ok), "ms": ms})
    print(f"  {'PASS' if ok else 'FAIL'}  {name}\n        expected: {expected}\n        got:      {actual}")


def get(path, cookie=None, base=None):
    """GET that also returns which API copy answered (the X-Served-By header)."""
    headers = {"cookie": f"feasto_session={cookie}"} if cookie else {}
    req = urllib.request.Request((base or API) + path, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            raw = r.read()
            return r.status, (json.loads(raw) if raw and r.headers.get_content_type() == "application/json" else raw), r.headers.get("X-Served-By")
    except urllib.error.HTTPError as e:
        return e.code, {}, e.headers.get("X-Served-By")


def wait_for(fn, seconds=20, step=0.25):
    """Polls fn until it returns something truthy; returns (value, ms it took)."""
    start = time.perf_counter()
    while time.perf_counter() - start < seconds:
        value = fn()
        if value:
            return value, round((time.perf_counter() - start) * 1000)
        time.sleep(step)
    return None, round((time.perf_counter() - start) * 1000)


def admin_password():
    with open(os.path.join(ROOT, ".env"), encoding="utf-8") as f:
        for line in f:
            if line.startswith("ADMIN_PASSWORD="):
                return line.split("=", 1)[1].strip().strip('"')
    sys.exit("ADMIN_PASSWORD is not in .env")


def admin_login():
    status, _, cookie = R.call("POST", "/auth/login", {"email": "admin@feasto.com", "password": admin_password()})
    assert status == 200, f"admin couldn't log in ({status})"
    return cookie.split("feasto_session=")[1].split(";")[0]


class Stream:
    """A live-updates connection (Server-Sent Events), like an open browser tab."""

    def __init__(self, cookie):
        req = urllib.request.Request(API + "/me/events", headers={"cookie": f"feasto_session={cookie}", "Accept": "text/event-stream"})
        self.response = urllib.request.urlopen(req, timeout=60)
        self.served_by = self.response.headers.get("X-Served-By")
        self.events = []
        threading.Thread(target=self._read, daemon=True).start()

    def _read(self):
        try:
            for raw in self.response:
                line = raw.decode("utf-8", "replace").strip()
                if line.startswith("data: "):
                    try:
                        self.events.append((time.perf_counter(), json.loads(line[6:])))
                    except ValueError:
                        pass
        except Exception:
            pass

    def close(self):
        try:
            self.response.close()
        except Exception:
            pass


def worker_pids():
    out = subprocess.run(["docker", "exec", "feasto-worker-1", "ps", "-o", "pid,args"], capture_output=True, text=True).stdout.splitlines()
    return [line.split()[0] for line in out if line.strip().endswith("/app/dist/worker.js")]


# ---------- Functional: one order from the menu to the door ----------

def functional(res, res2, rider, owner, admin):
    G = "Functional"

    # Accounts and roles
    status, _, _ = R.call("POST", "/auth/login", {"email": f"resident0.{R.RUN}{R.DOMAIN}", "password": "wrong-password"})
    check(G, "FT-01 Log in", "Log in with the right password, then with a wrong one", "right password: signed in; wrong one: refused (401)",
          f"right: signed in; wrong: {status}", status == 401)
    status, _, _ = get("/admin/system", res)
    check(G, "FT-02 Role check", "A resident opens an admin-only page", "refused (403)", f"{status}", status == 403)

    # Browsing
    name = f"Race Test Kitchen {R.RUN}"
    status, body, _ = get(f"/stores?q={urllib.parse.quote(name)}", res)
    found = any(s.get("id") == R.STORE for s in body.get("stores", [])) if isinstance(body, dict) else False
    check(G, "FT-03 Search stores", f"Search the store list for '{name}'", "the store is in the results", f"{status}, found: {found}", status == 200 and found)

    adobo = R.dish("Chicken Adobo", 20)
    rice = R.dish("Garlic Rice", None)
    status, body, _ = get(f"/stores/{R.STORE}", res)
    dishes = {d.get("name") for d in _menu(body)}
    check(G, "FT-04 Store page", "Open the store's page", "its menu shows Chicken Adobo and Garlic Rice", f"{status}, menu: {sorted(dishes)}",
          status == 200 and {"Chicken Adobo", "Garlic Rice"} <= dishes)

    # Cart and checkout (cash on delivery)
    R.call("DELETE", "/cart", cookie=res)
    s1, _, _ = R.call("PUT", "/cart/items", {"menuItemId": adobo, "quantity": 2}, res)
    s2, _, _ = R.call("PUT", "/cart/items", {"menuItemId": rice, "quantity": 2}, res)
    status, cart, _ = R.call("GET", "/cart/count", cookie=res)
    count = cart.get("count", 0)
    check(G, "FT-05 Cart", "Add 2 Chicken Adobo and 2 Garlic Rice to the cart", "the cart holds 4 items", f"{s1}/{s2}, {count} items", s1 == s2 == 200 and count == 4)

    address = R.one(f"""SELECT id FROM "Address" WHERE "userId" = '{R.RES[0]}' LIMIT 1""")
    status, body, _ = R.call("POST", "/checkout", R.checkout_body(fulfillment="DELIVERY", addressId=address), res)
    order = body.get("orderIds", [None])[0]
    stock = R.one(f"""SELECT stock FROM "MenuItem" WHERE id = '{adobo}'""")
    check(G, "FT-06 Place order", "Check out with delivery and cash on delivery", "order placed (201); Chicken Adobo stock 20 → 18",
          f"{status}, order {order}, stock {stock}", status == 201 and order and stock == "18")

    # The worker tells the store (API → outbox → RabbitMQ → worker → notification)
    told, ms = wait_for(lambda: R.one(f"""SELECT count(*) FROM "Notification" WHERE "userId" = '{R.OWNER}' AND title LIKE 'New order%'""") == "1")
    check(G, "FT-07 Store is told", "Wait for the new-order notice to reach the store", "one 'New order' notice, within a few seconds",
          f"{'1 notice' if told else 'none'} after {ms} ms", told, ms)

    # The store's side
    steps = [R.call("POST", f"/vendor/orders/{order}/{step}", {}, owner)[0] for step in ("accept", "preparing", "ready")]
    status_now = R.one(f"""SELECT status FROM "Order" WHERE id = '{order}'""")
    check(G, "FT-08 Store prepares", "The store taps Accept, Preparing, then Ready", "each step answered 200; the order is READY", f"{steps}, now {status_now}",
          steps == [200, 200, 200] and status_now == "READY")

    # The rider's side: the job reaches the nearest rider (worker dispatch + Redis geo index)
    R.call("POST", "/rider/position", {"lat": 11.5620, "lng": 124.3967}, rider)
    offered, ms = wait_for(lambda: order in json.dumps(R.call("GET", "/rider/jobs", cookie=rider)[1]), seconds=40, step=0.5)
    check(G, "FT-09 Job reaches a rider", "A rider shares their position near the store", "the job shows in the rider's job list",
          f"{'shown' if offered else 'not shown'} after {ms} ms", offered, ms)

    a, _, _ = R.call("POST", f"/rider/jobs/{order}/accept", {}, rider)
    p, _, _ = R.call("POST", f"/rider/active/{order}/picked-up", {}, rider)
    with open(PIN, "rb") as f:
        req = urllib.request.Request(API + "/uploads", data=f.read(), method="POST",
                                     headers={"Content-Type": "image/webp", "cookie": f"feasto_session={rider}"})
    with urllib.request.urlopen(req, timeout=30) as r:
        photo = json.loads(r.read())["url"]
    uploaded.append(photo)
    d, body, _ = R.call("POST", f"/rider/active/{order}/delivered", {"photoUrl": photo}, rider)
    status_now = R.one(f"""SELECT status || ' ' || coalesce("deliveryPhotoUrl", '-') FROM "Order" WHERE id = '{order}'""")
    check(G, "FT-10 Deliver", "The rider accepts, picks up, takes a proof photo and marks it delivered",
          "every step 200; the order is DELIVERED with the photo", f"{[a, p, d]}, now {status_now.split()[0]}, photo saved: {photo in status_now}",
          [a, p, d] == [200, 200, 200] and status_now.startswith("DELIVERED") and photo in status_now)

    s, order_body, _ = R.call("GET", f"/orders/{order}", cookie=res)
    seen = json.dumps(order_body).count("DELIVERED") > 0
    check(G, "FT-11 Resident sees it", "The resident opens the order", "status shows Delivered", f"{s}, delivered: {seen}", s == 200 and seen)

    s1, _, _ = R.call("POST", f"/orders/{order}/review", {"rating": 5, "comment": "Masarap!"}, res)
    s2, _, _ = R.call("POST", f"/orders/{order}/rider-rating", {"rating": 5, "tip": 20, "tipMethod": "GCASH"}, res)
    stars = R.one(f"""SELECT "ratingSum" || '/' || "ratingCount" FROM "Vendor" WHERE id = '{R.STORE}'""")
    tip = R.one(f"""SELECT tip FROM "Order" WHERE id = '{order}'""")
    check(G, "FT-12 Rate and tip", "Rate the store 5 stars, rate the rider and tip ₱20", "both saved (201); store 5/1, tip ₱20",
          f"{s1}/{s2}, store {stars}, tip ₱{tip}", s1 == s2 == 201 and stars == "5/1" and float(tip or 0) == 20)

    # Cancel and sold out
    R.fill_cart(res2, adobo, 3)
    _, body, _ = R.call("POST", "/checkout", R.checkout_body(), res2)
    second = body.get("orderIds", [None])[0]
    before = R.one(f"""SELECT stock FROM "MenuItem" WHERE id = '{adobo}'""")
    c, _, _ = R.call("POST", f"/orders/{second}/cancel", {}, res2)
    after = R.one(f"""SELECT stock FROM "MenuItem" WHERE id = '{adobo}'""")
    check(G, "FT-13 Cancel", "Order 3 more, then cancel before the store accepts", "cancelled (200); the 3 go back to stock", f"{c}, stock {before} → {after}",
          c == 200 and int(after) == int(before) + 3)

    R.call("DELETE", "/cart", cookie=res2)
    s, body, _ = R.call("PUT", "/cart/items", {"menuItemId": adobo, "quantity": 30}, res2)
    check(G, "FT-14 Not enough stock", "Try to add 30 Chicken Adobo when 18 are left", "refused (400), telling how many are left", f"{s}: {body.get('error', '')[:70]}", s == 400 and "18" in body.get("error", ""))
    R.call("DELETE", "/cart", cookie=res2)

    # Booking a table
    tomorrow = (datetime.now(timezone(timedelta(hours=8))) + timedelta(days=1)).strftime("%Y-%m-%d")
    b, body, _ = R.call("POST", "/bookings", {"vendorId": R.STORE, "date": tomorrow, "time": "18:00", "partySize": 3}, res)
    s, listing, _ = R.call("GET", f"/vendor/bookings?date={tomorrow}", cookie=owner)
    check(G, "FT-15 Book a table", "Book a table for 3 tomorrow at 6:00 PM", "booked (201); the store sees it in its bookings",
          f"{b}, store sees it: {'Racer 1' in json.dumps(listing)}", b == 201 and s == 200 and 'Racer 1' in json.dumps(listing))

    # Chat
    m1, _, _ = R.call("POST", f"/chat/{order}", {"body": "Salamat po!"}, res)
    s, msgs, _ = R.call("GET", f"/chat/{order}", cookie=owner)
    check(G, "FT-16 Chat", "The resident sends a message about the order", "the store reads it", f"{m1}, store sees it: {'Salamat po!' in json.dumps(msgs, ensure_ascii=False)}",
          m1 == 201 and "Salamat po!" in json.dumps(msgs, ensure_ascii=False))
    return order


def _menu(body):
    """Every dish in a store page answer, wherever the sections put it."""
    found = []
    def walk(x):
        if isinstance(x, dict):
            if "price" in x and "name" in x:
                found.append(x)
            for v in x.values():
                walk(v)
        elif isinstance(x, list):
            for v in x:
                walk(v)
    walk(body)
    return found


# ---------- Integration: the distributed parts working together ----------

def integration(res, owner, admin):
    G = "Integration"

    # IT-01 Nginx spreads requests over the three API copies
    served = Counter(get("/health")[2] for _ in range(60))
    check(G, "IT-01 Load balancing", "Send 60 requests to the API through Nginx", "all three copies (api-1, api-2, api-3) answer a share",
          dict(sorted(served.items())), set(served) == {"api-1", "api-2", "api-3"})

    # IT-02 One copy goes down: Nginx sends everyone to the others
    subprocess.run(["docker", "stop", "feasto-api-2-1"], capture_output=True)
    time.sleep(1)
    answers = [get("/health") for _ in range(60)]
    ok = sum(1 for a in answers if a[0] == 200)
    by = Counter(a[2] for a in answers)
    subprocess.run(["docker", "start", "feasto-api-2-1"], capture_output=True)
    back, ms = wait_for(lambda: "api-2" in {get("/health")[2] for _ in range(6)}, seconds=60, step=1)
    check(G, "IT-02 Failover", "Stop api-2, send 60 requests, start it again", "all 60 answered by api-1 and api-3; api-2 rejoins",
          f"{ok}/60 answered, {dict(sorted(by.items()))}; api-2 back after {ms} ms", ok == 60 and "api-2" not in by and back)

    # IT-03 A live update crosses API copies (Redis pub/sub → Server-Sent Events)
    stream = Stream(owner)
    time.sleep(0.5)
    dish = R.dish("Pancit Canton", None)
    R.fill_cart(res, dish)
    status, body, _ = R.call("POST", "/checkout", R.checkout_body(), res)
    got, ms = wait_for(lambda: next((e for t, e in stream.events if e.get("type") == "notification" and "New order" in e["notification"]["title"]), None))
    stream.close()
    check(G, "IT-03 Live update across copies", "The store keeps a live connection open while a resident orders",
          "the 'New order' notice arrives on the open connection by itself", f"connection on {stream.served_by}; notice arrived after {ms} ms" if got else "no notice",
          bool(got), ms)
    R.call("POST", f"/orders/{body['orderIds'][0]}/cancel", {}, res)

    # IT-04 The outbox → RabbitMQ → worker path, step by step (marshalling trace)
    s, body, _ = R.call("POST", "/admin/marshalling/sample", {}, admin)
    mid = body.get("messageId")
    def trail():
        _, t, _ = R.call("GET", "/admin/marshalling", cookie=admin)
        steps = [x for x in t.get("steps", []) if x.get("messageId") == mid]
        return steps if any(x.get("transport") == "rabbitmq" and x.get("step") == "unmarshal" for x in steps) else None
    steps, ms = wait_for(trail, seconds=15, step=0.5)
    path = [f"{x['instance']} {x['step']} ({x['transport']})" for x in reversed(steps or [])]
    check(G, "IT-04 Message path", "Send a sample order message from the admin's System page",
          "an API copy saves it to the outbox, a worker sends it to RabbitMQ, a worker takes it off the queue", "; ".join(path) or "incomplete", bool(steps), ms)

    # IT-05 A parallel report: one job per store, spread over the workers
    today = datetime.now(timezone(timedelta(hours=8))).strftime("%Y-%m-%d")
    start = (datetime.now(timezone(timedelta(hours=8))) - timedelta(days=29)).strftime("%Y-%m-%d")
    s, body, _ = R.call("POST", "/admin/reports", {"from": start, "to": today}, admin)
    rid = body.get("id")
    def done():
        _, r, _ = R.call("GET", f"/admin/reports/{rid}", cookie=admin)
        return r.get("report") if r.get("report", {}).get("status") == "done" else None
    report, ms = wait_for(done, seconds=60, step=0.5)
    check(G, "IT-05 Parallel report", "The admin asks for a 30-day sales report", "split into one job per store, computed by several workers, combined once",
          f"{report['total']} store jobs, computed by {', '.join(report['workers'])}, finished in {report['durationMs']} ms" if report else "not finished",
          bool(report) and len(report["workers"]) > 1 and report["done"] == report["total"], report and report["durationMs"])

    # IT-06 A worker process crashes: the others keep going and it is started again
    pids = worker_pids()
    subprocess.run(["docker", "exec", "feasto-worker-1", "kill", "-9", pids[0]], capture_output=True)
    back, ms = wait_for(lambda: len(worker_pids()) == len(pids) and pids[0] not in worker_pids(), seconds=20, step=0.5)
    logs = subprocess.run(["docker", "logs", "--since", "30s", "feasto-worker-1"], capture_output=True, text=True, encoding="utf-8")
    line = next((l for l in (logs.stdout + logs.stderr).splitlines() if "starting it again" in l), "")
    check(G, "IT-06 Worker crash", f"Kill one of the {len(pids)} worker processes", "it is started again; the count is back",
          f"{line.strip() or 'no restart line'}; {len(worker_pids())} running after {ms} ms", bool(back), ms)

    # IT-07 A photo uploaded through one copy loads through Nginx (shared volume)
    s, body, _ = get(uploaded[0], base=API.rsplit("/api", 1)[0]) if uploaded else (0, b"", None)
    check(G, "IT-07 Shared photos", "Open the proof-of-delivery photo uploaded in FT-10", "Nginx serves it from the shared folder (200)",
          f"{s}, {len(body) if isinstance(body, bytes) else 0} bytes", s == 200)

    # IT-08 The admin's System page sees every part
    time.sleep(6)  # one heartbeat
    _, system, _ = R.call("GET", "/admin/system", cookie=admin)
    online = sorted(i["instance"] for i in system.get("instances", []) if i.get("online"))
    queues = system.get("rabbitmq", {})
    check(G, "IT-08 System monitor", "Open Admin → System", "every API copy and worker online; PostgreSQL, Redis and RabbitMQ up",
          f"online: {', '.join(online)}; postgres {'up' if system.get('postgres', {}).get('up') else 'down'}, redis {'up' if system.get('redis', {}).get('up') else 'down'}, rabbitmq {'up' if queues else 'down'}",
          {"api-1", "api-2", "api-3"} <= set(online) and sum(1 for o in online if o.startswith("worker")) >= 2)
    return system


def main():
    print(f"Functional and integration tests, run {R.RUN}: making a test store, residents and riders…")
    R.create_fixtures()
    system = None
    try:
        R.unthrottle()
        res, res2 = R.login(f"resident0.{R.RUN}{R.DOMAIN}"), R.login(f"resident1.{R.RUN}{R.DOMAIN}")
        rider = R.login(f"rider0.{R.RUN}{R.DOMAIN}")
        owner = R.login(f"owner.{R.RUN}{R.DOMAIN}")
        admin = admin_login()
        print()
        functional(res, res2, rider, owner, admin)
        R.unthrottle()
        system = integration(res2, owner, admin)
    finally:
        R.sql(f"""DELETE FROM "OrderMessage" WHERE "orderId" IN (SELECT id FROM "Order" WHERE "vendorId" = '{R.STORE}');""")
        R.cleanup()
        for photo in uploaded:
            subprocess.run(["docker", "exec", "feasto-api-1-1", "rm", "-f", "/app" + photo], capture_output=True)
    passed = sum(r["passed"] for r in results)
    print(f"\n{passed} of {len(results)} passed. Test data removed.")
    os.makedirs(os.path.join(os.path.dirname(__file__), "results"), exist_ok=True)
    with open(os.path.join(os.path.dirname(__file__), "results", "functional.json"), "w", encoding="utf-8") as f:
        json.dump({"run": datetime.now().isoformat(timespec="seconds"), "passed": passed, "total": len(results), "results": results, "system": system},
                  f, indent=2, ensure_ascii=False)
    sys.exit(0 if passed == len(results) else 1)


if __name__ == "__main__":
    main()
