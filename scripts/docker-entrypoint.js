#!/usr/bin/env node
/**
 * Docker / Render entrypoint: migrate DB, then start the server.
 * Uses local package bins (not npx) and forwards SIGTERM to the server.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "..");

process.env.NODE_ENV ||= "production";
process.env.PORT ||= "3000";
process.env.HOST ||= "0.0.0.0";
process.env.DATABASE_URL ||= "file:/app/prisma/dev.sqlite";

const prismaCli = path.join(appRoot, "node_modules/prisma/build/index.js");
const serveCli = path.join(appRoot, "node_modules/@react-router/serve/bin.js");
const serverBuild = path.join(appRoot, "build/server/index.js");

console.log(
  `[entrypoint] NODE_ENV=${process.env.NODE_ENV} PORT=${process.env.PORT} HOST=${process.env.HOST}`,
);
console.log(`[entrypoint] DATABASE_URL=${process.env.DATABASE_URL}`);
console.log("[entrypoint] Running prisma migrate deploy...");

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      env: process.env,
      cwd: appRoot,
      shell: false,
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`${command} exited via signal ${signal}`));
        return;
      }
      if (code !== 0) {
        reject(
          new Error(`${command} ${args.join(" ")} exited with code ${code}`),
        );
        return;
      }
      resolve();
    });
  });
}

try {
  await run(process.execPath, [prismaCli, "migrate", "deploy"]);

  console.log(
    `[entrypoint] Starting react-router-serve on ${process.env.HOST}:${process.env.PORT}...`,
  );

  const server = spawn(process.execPath, [serveCli, serverBuild], {
    stdio: "inherit",
    env: process.env,
    cwd: appRoot,
    shell: false,
  });

  const forward = (signal) => {
    if (!server.killed) {
      server.kill(signal);
    }
  };

  process.on("SIGTERM", () => forward("SIGTERM"));
  process.on("SIGINT", () => forward("SIGINT"));

  server.on("error", (error) => {
    console.error("[entrypoint] Server failed to start:", error);
    process.exit(1);
  });

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
