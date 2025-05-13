import { serve } from "@hono/node-server";
import {
  BaseService,
  ServiceManager,
  createWorkerService,
  type HealthCheckResult,
} from "../index";
import { createServiceManagerAPI } from "../api";

// Create a simple service that runs in the main thread
class SimpleService extends BaseService {
  private intervalId: NodeJS.Timeout | null = null;

  constructor(name: string) {
    super(name);
  }

  async start(): Promise<void> {
    console.log(`Starting ${this.name}...`);

    // Simulate initialization
    await new Promise((resolve) => setTimeout(resolve, 1000));

    this.intervalId = setInterval(() => {
      console.log(`${this.name} is running...`);
    }, 5000);

    console.log(`${this.name} started successfully`);
  }

  async stop(): Promise<void> {
    console.log(`Stopping ${this.name}...`);

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    // Simulate cleanup
    await new Promise((resolve) => setTimeout(resolve, 500));

    console.log(`${this.name} stopped successfully`);
  }

  async healthCheck(): Promise<HealthCheckResult> {
    const baseCheck = await super.healthCheck();
    return {
      ...baseCheck,
      details: {
        memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024,
        uptime: process.uptime(),
      },
    };
  }
}

// Create a cron job service that runs every minute
class CronService extends BaseService {
  private taskName: string;

  constructor(name: string, taskName: string = "default task") {
    super(name);
    this.taskName = taskName;
  }

  async start(): Promise<void> {
    console.log(
      `Running cron job ${this.name} - ${this.taskName} at ${new Date().toISOString()}`
    );

    // Simulate work
    await new Promise((resolve) => setTimeout(resolve, 2000));

    console.log(
      `Cron job ${this.name} - ${this.taskName} completed at ${new Date().toISOString()}`
    );
  }

  async stop(): Promise<void> {
    console.log(`Stopping cron job ${this.name}...`);
  }
}

async function runDemo() {
  // Create a service manager
  const manager = new ServiceManager();

  // Add a simple service that runs in the main thread
  const mainService = new SimpleService("main-service");
  manager.addService(mainService, {
    restartPolicy: "always",
  });

  // Add a worker service from an existing worker file
  const workerService = createWorkerService(
    "logging-service",
    new URL("./services/logService.ts", import.meta.url),
    { autoTerminate: false }
  );
  manager.addService(workerService, {
    restartPolicy: "on-failure",
    maxRetries: 3,
  });

  // // Add a cron job service
  const backupService = new CronService("backup-service", "Daily backup");
  manager.addService(backupService, {
    cronJob: {
      schedule: "0 0 * * * *", // Run at the start of every hour (0 seconds, 0 minutes)
      timeout: 30000, // Timeout after 30 seconds
    },
  });

  // Add a cron job service that runs every 15 seconds
  const metricsService = new CronService("metrics-service", "Collect metrics");
  manager.addService(metricsService, {
    cronJob: {
      schedule: "*/15 * * * * *", // Run every 15 seconds
      timeout: 5000, // Timeout after 5 seconds
    },
  });

  // Add a cron job service that runs at specific times
  const notificationService = new CronService(
    "notification-service",
    "Send notifications"
  );
  manager.addService(notificationService, {
    cronJob: {
      schedule: "0 */5 9-17 * * 1-5", // Run every 5 minutes from 9 AM to 5 PM on weekdays
      timeout: 10000, // Timeout after 10 seconds
    },
  });

  // Start all services
  console.log("Starting all services...");
  await manager.startAllServices();

  // Monitor health
  setInterval(async () => {
    const healthStatus = await manager.healthCheckAllServices();
    console.log("Health Status:", JSON.stringify(healthStatus, null, 2));
  }, 10_000);

  // setTimeout(async () => {
  //   await manager.stopService("logging-service");
  // }, 200);

  // Set up graceful shutdown
  const shutdown = async () => {
    console.log("\nShutting down...");
    await manager.stopAllServices();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  console.log("Service manager is running. Press Ctrl+C to exit.");
}

runDemo().catch((err) => {
  console.error("Error in demo:", err);
  process.exit(1);
});
