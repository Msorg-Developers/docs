#!/usr/bin/env node
/**
 * Stop local Mint preview processes bound to ports 3000–3010.
 */
const { execSync } = require("child_process");

const ports = Array.from({ length: 11 }, (_, i) => 3000 + i);
const pids = new Set();

for (const port of ports) {
  try {
    const out = execSync(`lsof -ti tcp:${port}`, { encoding: "utf8" }).trim();
    if (out) out.split(/\s+/).forEach((pid) => pids.add(pid));
  } catch {
    // no listener on this port
  }
}

if (!pids.size) {
  console.info("No Mint preview found on ports 3000–3010.");
  process.exit(0);
}

for (const pid of pids) {
  try {
    process.kill(Number(pid), "SIGTERM");
    console.info(`Stopped PID ${pid}`);
  } catch (err) {
    console.warn(`Could not stop PID ${pid}: ${err.message}`);
  }
}
