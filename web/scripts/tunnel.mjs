// Gives this laptop's web app (port 3000) a temporary https:// address that phones can open.
// Finds cloudflared even when this terminal was opened before it was installed (its PATH is old).
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const candidates = [
  "cloudflared",
  "C:/Program Files (x86)/cloudflared/cloudflared.exe",
  "C:/Program Files/cloudflared/cloudflared.exe",
];
const cloudflared = candidates.find((path) =>
  path.includes("/") ? existsSync(path) : spawnSync(path, ["--version"], { stdio: "ignore" }).status === 0,
);

if (!cloudflared) {
  console.error("cloudflared isn't installed. Run: winget install Cloudflare.cloudflared");
  process.exit(1);
}

// With the classroom setup running (infra/lan/start.ps1), share that instead of `npm run dev`:
// it is the fast production build, and both addresses then show the same data.
const classroom = await fetch("http://localhost:8081/api/health", { signal: AbortSignal.timeout(2000) })
  .then((response) => response.ok)
  .catch(() => false);
const target = classroom ? "http://localhost:8081" : "http://localhost:3000";
console.log(
  classroom
    ? "The classroom setup is running: the tunnel opens it for people on other networks."
    : "Sharing npm run dev (port 3000). Start the classroom setup first to share that instead.",
);

console.log("Starting the tunnel. Open the https://...trycloudflare.com address below on your phone. Ctrl+C stops it.\n");
const tunnel = spawn(cloudflared, ["tunnel", "--url", target], { stdio: "inherit" });
tunnel.on("exit", (code) => process.exit(code ?? 0));
