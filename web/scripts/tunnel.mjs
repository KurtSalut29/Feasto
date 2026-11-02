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

console.log("Starting the tunnel. Open the https://...trycloudflare.com address below on your phone. Ctrl+C stops it.\n");
const tunnel = spawn(cloudflared, ["tunnel", "--url", "http://localhost:3000"], { stdio: "inherit" });
tunnel.on("exit", (code) => process.exit(code ?? 0));
