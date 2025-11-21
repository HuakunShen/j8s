import { serve } from "@hono/node-server";
import {
  BaseService,
  ServiceManager,
  createWorkerService,
  type HealthCheckResult,
} from "../index";
import { createServiceManagerAPI } from "../api";
import { Schedule, Duration } from "effect";

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

// Create a scheduled job service that runs every minute
class ScheduledService extends BaseService {
  private taskName: string;

  constructor(name: string, taskName: string = "default task") {
    super(name);
    this.taskName = taskName;
  }

  async start(): Promise<void> {
    console.log(
      `Running scheduled job ${this.name} - ${this.taskName} at ${new Date().toISOString()}`
    );

    // Simulate work
    await new Promise((resolve) => setTimeout(resolve, 2000));

    console.log(
      `Scheduled job ${this.name} - ${this.taskName} completed at ${new Date().toISOString()}`
    );
  }

  async stop(): Promise<void> {
    console.log(`Stopping scheduled job ${this.name}...`);
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

  // // Add a scheduled job service
  const backupService = new ScheduledService("backup-service", "Daily backup");
  manager.addService(backupService, {
    scheduledJob: {
      schedule: Schedule.cron("0 0 * * *"), // Run at midnight every day
      timeout: Duration.seconds(30), // Timeout after 30 seconds
    },
  });

  // Add a scheduled job service that runs every 15 seconds
  const metricsService = new ScheduledService("metrics-service", "Collect metrics");
  manager.addService(metricsService, {
    scheduledJob: {
      schedule: Schedule.spaced(Duration.seconds(15)), // Run every 15 seconds
      timeout: Duration.seconds(5), // Timeout after 5 seconds
    },
  });

  // Add a scheduled job service that runs at specific times
  const notificationService = new ScheduledService(
    "notification-service",
    "Send notifications"
  );
  manager.addService(notificationService, {
    scheduledJob: {
      schedule: Schedule.cron("0 */5 9-17 * * 1-5"), // Run every 5 minutes from 9 AM to 5 PM on weekdays
      timeout: Duration.seconds(10), // Timeout after 10 seconds
    },
  });

  // Start all services
  console.log("Starting all services...");
  await manager.startAllServices();
  console.log("All services started!");

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
