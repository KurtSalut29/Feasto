"""
How much faster a sales report gets with more worker processes.

    python loadtest/report_speedup.py

The admin's sales report is split into one job per store, and the worker processes share those
jobs (see server/src/worker.ts). This restarts the worker container with 1 worker, then with one
per CPU (the normal setting), asks for the same 30-day report 3 times each way, and prints the
times. It only reads sales; it changes no data. The worker container is left in its normal setting.
Results go to loadtest/results/report-speedup.json.
"""

import json, os, statistics, subprocess, sys, time
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(__file__))
import races as R
from functional import admin_login, wait_for

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
COMPOSE = ["docker", "compose", "-f", "docker-compose.yml", "-f", "docker-compose.lan.yml", "up", "-d", "--no-build", "worker"]
RUNS = 3


def restart_workers(count):
    env = {**os.environ, "COMPOSE_BAKE": "false", "WORKER_COUNT": str(count) if count else ""}
    env.setdefault("SITE_ADDRESS", "localhost")
    subprocess.run(COMPOSE, cwd=ROOT, env=env, capture_output=True, check=True)
    time.sleep(8)  # the workers connect to RabbitMQ
    out = subprocess.run(["docker", "exec", "feasto-worker-1", "ps", "-o", "args"], capture_output=True, text=True).stdout
    return sum(1 for line in out.splitlines() if line.strip().endswith("/app/dist/worker.js"))


def one_report(admin, start, end):
    status, body, _ = R.call("POST", "/admin/reports", {"from": start, "to": end}, admin)
    assert status == 202, body

    def done():
        _, r, _ = R.call("GET", f"/admin/reports/{body['id']}", cookie=admin)
        return r.get("report") if r.get("report", {}).get("status") == "done" else None

    report, _ = wait_for(done, seconds=120, step=0.2)
    assert report, "the report didn't finish"
    return report


def main():
    admin = admin_login()
    manila = timezone(timedelta(hours=8))
    end = datetime.now(manila).strftime("%Y-%m-%d")
    start = (datetime.now(manila) - timedelta(days=29)).strftime("%Y-%m-%d")
    rows = []
    try:
        for count in (1, 0):  # 0 = one per CPU, the normal setting
            running = restart_workers(count)
            admin = admin_login()
            one_report(admin, start, end)  # warm-up, not counted
            times, report = [], None
            for _ in range(RUNS):
                report = one_report(admin, start, end)
                times.append(report["durationMs"])
            rows.append({"workers": running, "storeJobs": report["total"], "computedBy": report["workers"], "runsMs": times,
                         "medianMs": statistics.median(times), "sales": report["totals"]["sales"], "orders": report["totals"]["orders"]})
            print(f"{running} worker(s): {report['total']} store jobs, runs {times} ms, median {statistics.median(times)} ms, computed by {', '.join(report['workers'])}")
    finally:
        restart_workers(0)
    speedup = rows[0]["medianMs"] / rows[1]["medianMs"]
    same = rows[0]["sales"] == rows[1]["sales"] and rows[0]["orders"] == rows[1]["orders"]
    print(f"\nSpeed-up: {speedup:.1f}x with {rows[1]['workers']} workers; same totals both ways: {same}")
    with open(os.path.join(os.path.dirname(__file__), "results", "report-speedup.json"), "w", encoding="utf-8") as f:
        json.dump({"run": datetime.now().isoformat(timespec="seconds"), "period": [start, end], "rows": rows, "speedup": round(speedup, 2), "sameTotals": same}, f, indent=2)


if __name__ == "__main__":
    main()
