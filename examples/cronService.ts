import { ServiceWorker, type IService } from "..";

class CronService implements IService {
  name = "cronService";

  async start(): Promise<void> {
    console.log("Cron service started");

    // Your scheduled task logic here
    console.log("Running scheduled task...");

    // Simulate some work
    await new Promise((resolve) => setTimeout(resolve, 1000));
    console.log("Task completed successfully");

    // Don't exit the process - the service manager will handle this
  }

  async stop(): Promise<void> {
    console.log("Cron service stopped");
  }
}

// Initialize the worker
new ServiceWorker(new CronService());
