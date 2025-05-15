import { ServiceManager, createWorkerService } from "../index";

// Create a worker service with custom data
const workerService = createWorkerService(
  "worker-with-data-service",
  new URL("./services/worker-with-data.ts", import.meta.url),
  {
    autoTerminate: false,
    workerData: {
      config: {
        maxIterations: 5,
        delay: 1000,
        message: "Hello from main thread 2!",
      },
      mode: "verbose",
    },
  }
);

// Create a service manager
const manager = new ServiceManager();

// Add the worker service with restart policy
manager.addService(workerService, {
  restartPolicy: "on-failure",
  maxRetries: 3,
});

try {
  // Start the service
  console.log("Starting worker service with custom data...");
  await manager.startService(workerService.name);

  // Check health status after a while to see the custom data in health details
  setTimeout(async () => {
    const health = await manager.healthCheckService(workerService.name);
    console.log("Health check result:", health);
  }, 2000);

  // Keep the process running
  console.log("Worker service manager is running. Press Ctrl+C to exit.");
} catch (error) {
  console.error("Error starting worker service:", error);
}
