import { ServiceManager, createWorkerService } from "../index";

async function main() {
  // Create a service manager
  const manager = new ServiceManager();

  // Add a worker service
  const logService = createWorkerService(
    "logging-service",
    new URL("./services/logService.ts", import.meta.url),
    { autoTerminate: false }
  );

  // Add service to manager with restart policy
  manager.addService(logService, {
    restartPolicy: "on-failure",
    maxRetries: 3,
  });

  // Start the service
  await manager.startService(logService.name);

  // Wait for 5 seconds
  await new Promise((resolve) => setTimeout(resolve, 5000));

  // Check the health
  const health = await manager.healthCheckService(logService.name);
  console.log("Health check result:", health);

  // Stop the service
  await manager.stopService(logService.name);

  console.log("Done");
}

main().catch(console.error);
