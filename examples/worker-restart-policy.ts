import { ServiceManager, createWorkerService } from "j8s";

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
  maxRetries: 3,
});

// Start the service
await manager.startService(workerService.name);

// Keep the process running to observe background failures and restarts
console.log("Worker service manager is running. Press Ctrl+C to exit.");

// Optional: Watch service status changes
setInterval(async () => {
  const health = await manager.healthCheckService(workerService.name);
  console.log(`Service status: ${health.status}`);
}, 5000);
