#!/usr/bin/env node
/**
 * Docker / Render entrypoint: migrate DB, then start the server.
 * Uses exec-style spawn so the server becomes PID 1 and receives SIGTERM.
 */
import { spawn } from "node:child_process";

process.env.NODE_ENV ||= "production";
process.env.PORT ||= "3000";
process.env.DATABASE_URL ||= "file:/app/prisma/dev.sqlite";

console.log(
  `[entrypoint] NODE_ENV=${process.env.NODE_ENV} PORT=${process.env.PORT}`,
);
console.log(`[entrypoint] DATABASE_URL=${process.env.DATABASE_URL}`);
console.log("[entrypoint] Running prisma migrate deploy...");

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      env: process.env,
      shell: false,
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`${command} exited via signal ${signal}`));
        return;
      }
      if (code !== 0) {
        reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
        return;
      }
      resolve();
    });
  });
}

try {
  await run("npx", ["prisma", "migrate", "deploy"]);
  console.log(
    `[entrypoint] Starting react-router-serve on PORT=${process.env.PORT}...`,
  );

  const server = spawn(
    "npx",
    ["react-router-serve", "./build/server/index.js"],
    {
      stdio: "inherit",
      env: process.env,
      shell: false,
    },
  );

  const forward = (signal) => {
    if (!server.killed) {
      server.kill(signal);
    }
  };

  process.on("SIGTERM", () => forward("SIGTERM"));
  process.on("SIGINT", () => forward("SIGINT"));

  server.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 1);
  });
} catch (error) {
  console.error("[entrypoint] Failed:", error.message ?? error);
  process.exit(1);
}
