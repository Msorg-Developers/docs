#!/usr/bin/env node
/**
 * Run Mint local preview under Homebrew Node 22 when available (avoids Node 25 for the CLI).
 * Uses `mint@latest` by default so you pick up CLI fixes without a global upgrade.
 *
 * Env:
 *   MINT_PACKAGE  — override package spec (default: mint@latest)
 *
 * If preview logs still show localStorage/Invalid URL noise, use: npm run dev:docker
 */
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const docsRoot = path.join(__dirname, "..");
const mintPkg = process.env.MINT_PACKAGE || "mint@latest";

function findNode22HomebrewPrefix() {
  const candidates = [
    process.env.HOMEBREW_PREFIX && path.join(process.env.HOMEBREW_PREFIX, "opt", "node@22"),
    "/opt/homebrew/opt/node@22",
    "/usr/local/opt/node@22",
  ].filter(Boolean);

  for (const p of candidates) {
    if (fs.existsSync(path.join(p, "bin", "node"))) return p;
  }
  return null;
}

function npxCliForPrefix(prefix) {
  const p = path.join(prefix, "lib", "node_modules", "npm", "bin", "npx-cli.js");
  return fs.existsSync(p) ? p : null;
}

const prefix22 = findNode22HomebrewPrefix();
const major = Number(String(process.version).replace(/^v/, "").split(".")[0]);

function run(nodeExe, npxCli, args) {
  const child = spawn(nodeExe, [npxCli, ...args], {
    cwd: docsRoot,
    env: {
      ...process.env,
      PATH: `${path.dirname(nodeExe)}${path.delimiter}${process.env.PATH}`,
    },
    stdio: "inherit",
    shell: false,
  });
  child.on("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    process.exit(code ?? 0);
  });
}

if (prefix22) {
  const nodeExe = path.join(prefix22, "bin", "node");
  const npxCli = npxCliForPrefix(prefix22);
  if (!npxCli) {
    console.error(`Could not find npm npx-cli.js under ${prefix22}/lib/node_modules/npm/bin/`);
    process.exit(1);
  }
  const v = require("child_process")
    .execFileSync(nodeExe, ["-v"], { encoding: "utf8" })
    .trim();
  console.info(
    `[dancity-docs] npx ${mintPkg} dev — Node ${v} (${nodeExe}); shell was ${process.version}.\n`,
  );
  run(nodeExe, npxCli, ["--yes", mintPkg, "dev"]);
} else if (major >= 25) {
  console.error("\nNeed Homebrew node@22 (side-by-side) or Node before v25 on PATH.\n");
  console.error("  brew install node@22\n");
  console.error("Or: npm run dev:docker\n");
  process.exit(1);
} else {
  console.info(`[dancity-docs] npx ${mintPkg} dev — Node ${process.version}\n`);
  const child = spawn("npx", ["--yes", mintPkg, "dev"], {
    cwd: docsRoot,
    env: process.env,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  child.on("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    process.exit(code ?? 0);
  });
}
