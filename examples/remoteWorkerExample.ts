import { ServiceManager } from "../src/serviceManager";
import { fileURLToPath } from "url";
import path from "path";

async function main() {
  const serviceManager = new ServiceManager();

  // Get absolute path for the script
  const currentDir = path.dirname(fileURLToPath(import.meta.url));

  // Example 1: Register a service using script path (traditional way)
  // Now using our simplified worker implementation
  const simplifiedServicePath = path.resolve(
    currentDir,
    "./simplifiedLogService.ts",
  );
  serviceManager.register({
    name: "simplifiedLoggingService",
    script: simplifiedServicePath,
    longRunning: true,
    restartPolicy: "always",
  });

  // Example 2: Register a service using the legacy worker (for backward compatibility)
  const legacyServicePath = path.resolve(currentDir, "./logService.ts");
  serviceManager.register({
    name: "legacyLoggingService",
    script: legacyServicePath,
    longRunning: true,
    restartPolicy: "always",
  });

  // Example 3: Register a service using a pre-created worker
  // Create a worker from a remote URL (or any Worker instance)
  const remoteWorker = new Worker(
    new URL("./simplifiedLogService.ts", import.meta.url).href,
    { type: "module" },
  );

  // Register the service with the pre-created worker
  serviceManager.register({
    name: "remoteLoggingService",
    worker: remoteWorker,
    longRunning: true,
    restartPolicy: "always",
  });

  // Start all services
  await serviceManager.startAll();
  console.log("All services started");

  // Get status of all services
  console.log("Services status:", serviceManager.status());

  // After a while, stop all services
  setTimeout(async () => {
    await serviceManager.stopAll();
    console.log("All services stopped");
  }, 10000);
}

main().catch(console.error);
