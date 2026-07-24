/**
 * Dev: Vite (renderer HMR) + Electron (main/preload recompilados com tsc).
 * Uso: pnpm --filter @codingpro/desktop dev
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(__dirname, "..");
const repoRoot = resolve(pkgRoot, "..", "..");
const DEV_URL = "http://127.0.0.1:5173";

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  const content = readFileSync(path, "utf8");
  for (const line of content.split(/\r?\n/u)) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m) continue;
    const key = m[1];
    const val = (m[2] ?? "").trim().replace(/^["']|["']$/g, "");
    if (key && process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
}

loadEnvFile(join(repoRoot, ".codingpro", ".env"));
loadEnvFile(join(pkgRoot, ".codingpro", ".env"));
loadEnvFile(
  join(process.env.USERPROFILE || process.env.HOME || "", ".config", "codingpro", "deepseek.env"),
);

function run(cmd, args, opts = {}) {
  return spawn(cmd, args, {
    cwd: pkgRoot,
    stdio: opts.stdio ?? "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, ...opts.env },
    ...opts,
  });
}

// 1) compila main (tsc) + preload CJS (esbuild)
console.log("[dev] build main + preload…");
const buildMain = run("pnpm", ["run", "build:main"], { stdio: "inherit" });
await new Promise((resolvePromise, reject) => {
  buildMain.on("exit", (code) =>
    code === 0 ? resolvePromise() : reject(new Error(`build:main exit ${code}`)),
  );
});

// 2) vite dev server
console.log("[dev] vite…");
const vite = run("pnpm", ["exec", "vite", "--host", "127.0.0.1", "--port", "5173"], {
  stdio: ["ignore", "pipe", "pipe"],
});

let viteReady = false;
const onViteData = (buf) => {
  const text = buf.toString();
  process.stdout.write(text);
  if (!viteReady && (text.includes("Local:") || text.includes("5173"))) {
    viteReady = true;
  }
};
vite.stdout?.on("data", onViteData);
vite.stderr?.on("data", onViteData);

// espera o servidor
const started = Date.now();
while (!viteReady && Date.now() - started < 30_000) {
  await new Promise((r) => setTimeout(r, 200));
  try {
    const res = await fetch(DEV_URL);
    if (res.ok || res.status === 404) {
      viteReady = true;
      break;
    }
  } catch {
    // ainda subindo
  }
}
if (!viteReady) {
  console.error("[dev] Vite não subiu a tempo");
  vite.kill();
  process.exit(1);
}

const require = createRequire(import.meta.url);
const electronPath = require("electron");

console.log("[dev] electron…");
const electron = spawn(electronPath, [pkgRoot], {
  cwd: repoRoot,
  env: {
    ...process.env,
    VITE_DEV_SERVER_URL: DEV_URL,
    ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
  },
  stdio: "inherit",
  windowsHide: false,
});

const shutdown = () => {
  electron.kill();
  vite.kill();
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

electron.on("exit", (code) => {
  vite.kill();
  process.exit(code ?? 0);
});
vite.on("exit", (code) => {
  if (code && code !== 0) {
    electron.kill();
    process.exit(code);
  }
});
