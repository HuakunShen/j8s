import { Effect } from "effect";
import { ServiceManager, createWorkerService } from "../index";
import type { HealthCheckResult } from "../src/interface";

// Set up a more robust error handling for Node.js
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection:", reason);
  // Don't exit the process so we can see the restart behavior
});

// Create a worker service that will randomly fail
const workerService = createWorkerService(
  "worker-failure-service",
  new URL("./services/worker-failure.ts", import.meta.url),
  { autoTerminate: false }
);

// Create a service manager
const manager = new ServiceManager();

// Add the worker service with restart policy
manager.addService(workerService, {
  restartPolicy: "on-failure",
  maxRetries: 3, // Set max retries to 3
});

try {
  // Start the service
  console.log("Starting worker service with max retries of 3...");
  await Effect.runPromise(manager.startService(workerService.name));

  // Watch service status
  const statusInterval = setInterval(async () => {
    try {
      const health: HealthCheckResult = await Effect.runPromise(
        manager.healthCheckService(workerService.name)
      );
      console.log(
        `[${new Date().toISOString()}] Service status: ${health.status}, restart count: ${(manager as any).serviceMap.get(workerService.name)?.restartCount || 0}`
      );

      // If we've exceeded max retries, stop the process
      if (
        health.status === "crashed" &&
        (manager as any).serviceMap.get(workerService.name)?.restartCount >= 3
      ) {
        console.log(
          "Service has reached max retries (3). Will not restart further."
        );
        clearInterval(statusInterval);
      }
    } catch (err) {
      console.error("Error checking service health:", err);
    }
  }, 2000);

  // Keep the process running
  console.log("Worker service manager is running. Press Ctrl+C to exit.");
} catch (error) {
  console.error("Error starting worker service:", error);
}
