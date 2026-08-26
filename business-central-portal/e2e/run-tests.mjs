import { spawn, execFileSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", "3100"], {
  stdio: "inherit",
  windowsHide: true,
});

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch("http://127.0.0.1:3100/login");
      if (response.ok || response.status < 500) return;
    } catch {
      // The server is still starting.
    }
    await delay(1_000);
  }
  throw new Error("Next production server did not start within 60 seconds.");
}

function stopServer() {
  if (!server.pid) return;
  if (process.platform === "win32") {
    try {
      execFileSync("taskkill", ["/pid", String(server.pid), "/t", "/f"], {
        stdio: "ignore",
      });
    } catch {
      // The process may already have exited.
    }
  } else {
    server.kill("SIGTERM");
  }
}

let exitCode = 1;
try {
  await waitForServer();
  const runner = spawn(
    process.execPath,
    ["node_modules/@playwright/test/cli.js", "test", ...process.argv.slice(2)],
    { stdio: "inherit", windowsHide: true },
  );
  exitCode = await new Promise((resolve, reject) => {
    runner.once("error", reject);
    runner.once("exit", (code, signal) => resolve(code ?? (signal ? 1 : 0)));
  });
} catch (error) {
  console.error(error);
} finally {
  stopServer();
  // Playwright and Next can retain Windows child-process handles after all
  // assertions have completed. The runner owns both processes, so its exit
  // code is authoritative and can terminate the wrapper deterministically.
  process.exit(exitCode);
}
